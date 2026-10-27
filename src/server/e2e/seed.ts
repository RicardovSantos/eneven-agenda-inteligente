import { timingSafeEqual } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import sharp from "sharp";
import {
  bookingServices,
  bookings,
  customers,
  memberships,
  professionals,
  services,
  tenants,
  timeBlocks,
  users,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { defaultBusinessHours } from "@/lib/weekly-hours";
import { cancelBooking, createBooking, setBookingStatus } from "@/server/agenda/bookings";
import { addDaysToDate, localDateOf, weekdayOf, zonedInstant } from "@/server/agenda/time";
import { SESSION_COOKIE } from "@/server/auth/cookie-names";
import { createSession } from "@/server/auth/session";
import { createTenantWithOwner } from "@/server/auth/signup";
import { listProfessionals, saveProfessional, saveService } from "@/server/catalog";
import { uploadLogo } from "@/server/settings";
import { inviteMemberForTests } from "@/server/team/invitations";
import { withTenant } from "@/server/tenant-db";

/**
 * Apoio dos testes de ponta a ponta (Playwright): cria estabelecimentos e
 * agendamentos direto no banco de desenvolvimento (PGlite). SÓ existe como
 * rota quando `E2E_SEED` está definido E o processo não é de produção, e cada
 * chamada precisa do mesmo segredo no cabeçalho `x-e2e-seed`.
 */

export function e2eSeedAllowed(headers: { get(name: string): string | null }): boolean {
  const secret = process.env.E2E_SEED;
  if (!secret || process.env.NODE_ENV === "production") return false;
  const given = headers.get("x-e2e-seed") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type SeedTenantOptions = {
  name?: string;
  /** `null` = sem cor escolhida. */
  color?: string | null;
  verified?: boolean;
  status?: "trial" | "active" | "past_due" | "read_only" | "canceled";
  trialEndsAt?: string;
  whatsapp?: string;
  address?: string;
  about?: string;
  cancelWindowMin?: number;
  /** Cria um logo PNG sólido na cor dada. */
  logoColor?: string;
  services?: Array<{ name: string; durationMin: number; priceCents: number; visible?: boolean }>;
  /** Profissionais além da dona (que se chama "Bia"). */
  extraProfessionals?: string[];
};

const DEFAULT_SERVICES: NonNullable<SeedTenantOptions["services"]> = [
  { name: "Piercing hélix", durationMin: 30, priceCents: 9000 },
  { name: "Piercing tragus", durationMin: 30, priceCents: 10000 },
  { name: "Troca de joia", durationMin: 15, priceCents: 3000 },
];
const COLORS = ["#0E7C86", "#B4237A", "#2F6FDB", "#8A5A00"];

export async function seedE2eTenant(db: Db, options: SeedTenantOptions = {}) {
  const suffix = Math.random().toString(36).slice(2, 7);
  const { tenantId, slug, userId } = await createTenantWithOwner(db, {
    businessName: options.name ?? "Studio Defendi",
    ownerName: "Bia",
    email: `e2e-${suffix}-${Date.now()}@exemplo.com`,
    whatsapp: options.whatsapp ?? "5511987654321",
    passwordHash: null,
    emailVerifiedAt: options.verified === false ? null : new Date(),
  });

  await db
    .update(tenants)
    .set({
      brandColor: options.color === undefined ? "#B4237A" : options.color,
      address: options.address ?? "Rua Augusta, 120",
      about: options.about ?? null,
      status: options.status ?? "trial",
      // Sem o assistente de primeiros passos: o painel abre direto na agenda.
      onboardingCompletedAt: new Date(),
      ...(options.trialEndsAt ? { trialEndsAt: new Date(options.trialEndsAt) } : {}),
      ...(options.cancelWindowMin !== undefined ? { cancelWindowMin: options.cancelWindowMin } : {}),
      slotIntervalMin: 30,
      minNoticeMin: 60,
      maxDaysAhead: 60,
    })
    .where(eq(tenants.id, tenantId));

  if (options.logoColor) {
    const png = await sharp({
      create: { width: 256, height: 256, channels: 3, background: options.logoColor },
    })
      .png()
      .toBuffer();
    await uploadLogo(db, tenantId, { mime: "image/png", bytes: png });
  }

  const [owner] = await listProfessionals(db, tenantId);
  const professionalIds = [owner.id];
  const business = defaultBusinessHours();
  const weekdayHours = { ...business, 6: [] };
  const extras = options.extraProfessionals ?? [];

  // Extras só existem depois dos serviços (que os ligam); criados em seguida.
  const serviceIds: string[] = [];
  for (const service of options.services ?? DEFAULT_SERVICES) {
    const { id } = await saveService(db, tenantId, {
      name: service.name,
      description: null,
      durationMin: service.durationMin,
      bufferAfterMin: 0,
      priceCents: service.priceCents,
      visible: service.visible ?? true,
      professionalIds: [owner.id],
    });
    serviceIds.push(id);
  }
  for (const [index, name] of extras.entries()) {
    const { id } = await saveProfessional(db, tenantId, {
      name,
      color: COLORS[index % COLORS.length],
      active: true,
      serviceIds,
      hours: weekdayHours,
    });
    professionalIds.push(id);
  }
  return { tenantId, slug, userId, serviceIds, professionalIds };
}

export type SeedBookingOptions = {
  slug: string;
  /** Início daqui a N minutos (arredondado para 5 min). Sem isso nem `startsAt`: 3 dias úteis à frente, 10:00. */
  startsInMinutes?: number;
  startsAt?: string;
  serviceIndex?: number;
  status?: "scheduled" | "confirmed" | "completed" | "no_show" | "canceled";
  /** Índice do profissional (ordem de criação); sem isso, qualquer disponível. */
  professionalIndex?: number;
  customerName?: string;
  phone?: string;
};

async function tenantIdOf(db: Db, slug: string) {
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug));
  if (!tenant) throw new Error(`Estabelecimento não encontrado: ${slug}`);
  return tenant.id;
}

/** Padrão: daqui a 3 dias, num dia útil, às 10:00 de São Paulo (horário comercial). */
function defaultStart(now: Date = new Date()): Date {
  const timezone = "America/Sao_Paulo";
  let date = addDaysToDate(localDateOf(now, timezone), 3);
  while (weekdayOf(date) === 0 || weekdayOf(date) === 6) date = addDaysToDate(date, 1);
  return zonedInstant(date, 10 * 60, timezone);
}

export async function seedE2eBooking(db: Db, options: SeedBookingOptions) {
  const tenantId = await tenantIdOf(db, options.slug);
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .select({ id: services.id })
      .from(services)
      .where(eq(services.tenantId, tenantId))
      .orderBy(asc(services.createdAt), asc(services.id)),
  );
  const serviceId = rows[options.serviceIndex ?? 0].id;

  const startsAt = options.startsAt
    ? new Date(options.startsAt)
    : options.startsInMinutes !== undefined
      ? new Date(Math.ceil((Date.now() + options.startsInMinutes * 60_000) / 300_000) * 300_000)
      : defaultStart();

  const pros = await withTenant(db, tenantId, (tx) =>
    tx
      .select({ id: professionals.id })
      .from(professionals)
      .where(eq(professionals.tenantId, tenantId))
      .orderBy(asc(professionals.sortOrder), asc(professionals.createdAt), asc(professionals.id)),
  );
  const { bookingId, manageToken } = await createBooking(db, tenantId, {
    serviceIds: [serviceId],
    professionalId: options.professionalIndex === undefined ? "any" : pros[options.professionalIndex].id,
    startsAt,
    customer: { name: options.customerName ?? "Paula Souza", phone: options.phone ?? "(11) 98765-4321" },
    source: "panel",
    allowOutsideHours: true,
  });
  if (options.status === "canceled") {
    await cancelBooking(db, tenantId, bookingId, "staff");
  } else if (options.status && options.status !== "scheduled") {
    await setBookingStatus(db, tenantId, bookingId, options.status);
  }
  return { bookingId, token: manageToken, startsAt: startsAt.toISOString() };
}

/** Agendamentos do estabelecimento, para conferir o resultado da tela no banco. */
export async function listE2eBookings(db: Db, slug: string) {
  const tenantId = await tenantIdOf(db, slug);
  return withTenant(db, tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: bookings.id,
        status: bookings.status,
        source: bookings.source,
        startsAt: bookings.startsAt,
        totalCents: bookings.totalCents,
        customerName: customers.name,
        customerPhone: customers.phone,
        customerEmail: customers.email,
        professional: professionals.name,
      })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .innerJoin(professionals, eq(professionals.id, bookings.professionalId))
      .where(eq(bookings.tenantId, tenantId));
    const lines = await tx
      .select({ bookingId: bookingServices.bookingId, name: bookingServices.name })
      .from(bookingServices)
      .where(eq(bookingServices.tenantId, tenantId));
    return rows.map((row) => ({
      ...row,
      startsAt: row.startsAt.toISOString(),
      services: lines.filter((l) => l.bookingId === row.id).map((l) => l.name),
    }));
  });
}

export type SeedBlockOptions = {
  slug: string;
  startsAt: string;
  endsAt: string;
  reason?: string;
  /** Índice do profissional; sem isso, o estabelecimento todo. */
  professionalIndex?: number;
};

/** Bloqueio de agenda (folga, almoço) para as capturas de tela. */
export async function seedE2eBlock(db: Db, options: SeedBlockOptions) {
  const tenantId = await tenantIdOf(db, options.slug);
  return withTenant(db, tenantId, async (tx) => {
    let professionalId: string | null = null;
    if (options.professionalIndex !== undefined) {
      const pros = await tx
        .select({ id: professionals.id })
        .from(professionals)
        .where(eq(professionals.tenantId, tenantId))
        .orderBy(asc(professionals.sortOrder), asc(professionals.createdAt), asc(professionals.id));
      professionalId = pros[options.professionalIndex].id;
    }
    const [row] = await tx
      .insert(timeBlocks)
      .values({
        tenantId,
        professionalId,
        startsAt: new Date(options.startsAt),
        endsAt: new Date(options.endsAt),
        reason: options.reason ?? null,
      })
      .returning({ id: timeBlocks.id });
    return { blockId: row.id };
  });
}

/** Sessão do proprietário, para o Playwright entrar no painel sem passar pela tela de login. */
export async function seedE2eSession(db: Db, slug: string) {
  const tenantId = await tenantIdOf(db, slug);
  const [owner] = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.tenantId, tenantId))
    .limit(1);
  if (!owner) throw new Error(`Proprietário não encontrado: ${slug}`);
  const token = await createSession(db, owner.userId, tenantId);
  return { token, cookieName: SESSION_COOKIE };
}

/** Marca o e-mail do proprietário como confirmado (no lugar de abrir o link enviado por e-mail). */
export async function verifyE2eOwnerEmail(db: Db, slug: string) {
  const tenantId = await tenantIdOf(db, slug);
  const [owner] = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.tenantId, tenantId))
    .limit(1);
  if (!owner) throw new Error(`Proprietário não encontrado: ${slug}`);
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, owner.userId));
  return { ok: true };
}

/**
 * Usuário novo com o papel dado (`reception` ou `staff`) no estabelecimento,
 * com sessão pronta: para os testes de menu e acesso por papel.
 */
export async function seedE2eMember(db: Db, slug: string, role: "owner" | "reception" | "staff") {
  const tenantId = await tenantIdOf(db, slug);
  const suffix = Math.random().toString(36).slice(2, 7);
  const [user] = await db
    .insert(users)
    .values({
      email: `e2e-${role}-${suffix}-${Date.now()}@exemplo.com`,
      passwordHash: null,
      name: role === "reception" ? "Rita Recepção" : "Paulo Profissional",
      emailVerifiedAt: new Date(),
    })
    .returning({ id: users.id });
  await db.insert(memberships).values({ userId: user.id, tenantId, role });
  const token = await createSession(db, user.id, tenantId);
  return { token, cookieName: SESSION_COOKIE, userId: user.id };
}

export type SeedInviteOptions = {
  slug: string;
  name: string;
  email: string;
  role: "reception" | "staff";
  /** Índice do profissional (ordem de criação); obrigatório para `staff`. */
  professionalIndex?: number;
};

/**
 * Convite de equipe emitido pelo proprietário, devolvendo o token (que em
 * produção só vai por e-mail): o e2e abre o link sem ler uma caixa de entrada.
 */
export async function seedE2eInvite(db: Db, options: SeedInviteOptions) {
  const tenantId = await tenantIdOf(db, options.slug);
  const [owner] = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.role, "owner")))
    .limit(1);
  if (!owner) throw new Error(`Proprietário não encontrado: ${options.slug}`);

  let professionalId: string | undefined;
  if (options.role === "staff") {
    const pros = await withTenant(db, tenantId, (tx) =>
      tx
        .select({ id: professionals.id })
        .from(professionals)
        .where(eq(professionals.tenantId, tenantId))
        .orderBy(asc(professionals.sortOrder), asc(professionals.createdAt), asc(professionals.id)),
    );
    professionalId = pros[options.professionalIndex ?? 0]?.id;
  }
  const { token, invitationId } = await inviteMemberForTests(
    db,
    { tenantId, userId: owner.userId, role: "owner" },
    { name: options.name, email: options.email, role: options.role, professionalId },
  );
  return { token, invitationId };
}
