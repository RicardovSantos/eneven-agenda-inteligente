import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { auditLog, plans, tenants, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { normalizeBrazilPhone } from "@/lib/phone";
import { AuthError } from "@/server/auth/errors";
import { normalizeEmail } from "@/server/auth/login";
import { toFieldErrors } from "@/server/auth/schemas";
import { createTenantWithOwner } from "@/server/auth/signup";
import { PlatformError, UUID, tenantNotFound } from "./errors";

/** Quem executa a ação (super-admin já verificado pela camada de app). */
export type AdminActor = { userId: string };

const DAY_MS = 86_400_000;
const EMAIL_TAKEN = "Já existe uma conta com esse e-mail.";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function loadTenant(tx: Tx, tenantId: string) {
  if (!UUID.test(tenantId)) throw tenantNotFound();
  const [row] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!row) throw tenantNotFound();
  return row;
}

async function audit(
  tx: Tx,
  actor: AdminActor,
  tenantId: string | null,
  action: string,
  details: Record<string, unknown>,
) {
  await tx.insert(auditLog).values({ actorUserId: actor.userId, tenantId, action, details });
}

export async function changePlan(
  db: Db,
  actor: AdminActor,
  tenantId: string,
  planId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tenantId}))`);
    const tenant = await loadTenant(tx, tenantId);
    if (!UUID.test(planId)) throw new PlatformError("not_found", "Plano não encontrado.");
    const [plan] = await tx.select().from(plans).where(eq(plans.id, planId)).limit(1);
    if (!plan) throw new PlatformError("not_found", "Plano não encontrado.");
    if (!plan.active) {
      throw new PlatformError("invalid_state", "Este plano está inativo e não pode ser atribuído.");
    }
    if (tenant.planId === planId) return;
    const [from] = await tx
      .select({ code: plans.code })
      .from(plans)
      .where(eq(plans.id, tenant.planId))
      .limit(1);
    await tx.update(tenants).set({ planId }).where(eq(tenants.id, tenantId));
    await audit(tx, actor, tenantId, "tenant.plan_changed", {
      from: from?.code ?? tenant.planId,
      to: plan.code,
    });
  });
}

/**
 * Prorroga o teste: novo prazo = maior entre agora e o prazo atual, mais os
 * dias. Só vale para quem está em teste (vencido ou não) ou foi para somente
 * leitura sem nunca ter ativado.
 */
export async function extendTrial(
  db: Db,
  actor: AdminActor,
  tenantId: string,
  days: 7 | 14 | 30,
  now: Date = new Date(),
): Promise<void> {
  if (![7, 14, 30].includes(days)) {
    throw new PlatformError("validation", "Escolha 7, 14 ou 30 dias.");
  }
  await db.transaction(async (tx) => {
    const tenant = await loadTenant(tx, tenantId);
    const eligible =
      tenant.status === "trial" || (tenant.status === "read_only" && tenant.activatedAt === null);
    if (!eligible) {
      throw new PlatformError("invalid_state", "Este estabelecimento não está em teste.");
    }
    const base = Math.max(now.getTime(), tenant.trialEndsAt.getTime());
    const trialEndsAt = new Date(base + days * DAY_MS);
    await tx.update(tenants).set({ trialEndsAt, status: "trial" }).where(eq(tenants.id, tenantId));
    await audit(tx, actor, tenantId, "tenant.trial_extended", {
      days,
      fromStatus: tenant.status,
      from: tenant.trialEndsAt.toISOString(),
      to: trialEndsAt.toISOString(),
    });
  });
}

async function setStatus(
  db: Db,
  actor: AdminActor,
  tenantId: string,
  status: "active" | "read_only" | "canceled",
  action: string,
  now?: Date,
) {
  await db.transaction(async (tx) => {
    const tenant = await loadTenant(tx, tenantId);
    if (tenant.status === status) return;
    await tx
      .update(tenants)
      .set({
        status,
        ...(status === "active" ? { activatedAt: tenant.activatedAt ?? now ?? new Date() } : {}),
      })
      .where(eq(tenants.id, tenantId));
    await audit(tx, actor, tenantId, action, { from: tenant.status, to: status });
  });
}

export const activateTenant = (
  db: Db,
  actor: AdminActor,
  tenantId: string,
  now: Date = new Date(),
) => setStatus(db, actor, tenantId, "active", "tenant.activated", now);

export const blockTenant = (db: Db, actor: AdminActor, tenantId: string) =>
  setStatus(db, actor, tenantId, "read_only", "tenant.blocked");

export const cancelTenant = (db: Db, actor: AdminActor, tenantId: string) =>
  setStatus(db, actor, tenantId, "canceled", "tenant.canceled");

const createTenantSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1, "Informe o nome do estabelecimento.")
    .max(120, "O nome pode ter no máximo 120 caracteres."),
  ownerName: z
    .string()
    .trim()
    .min(1, "Informe o nome do dono.")
    .max(120, "O nome pode ter no máximo 120 caracteres."),
  ownerEmail: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Informe um e-mail válido.").max(254, "Informe um e-mail válido.")),
  whatsapp: z.string().transform((value, ctx) => {
    const normalized = normalizeBrazilPhone(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Informe um WhatsApp com DDD." });
      return z.NEVER;
    }
    return normalized;
  }),
  planId: z.string().regex(UUID, "Escolha um plano."),
  trialDays: z
    .number()
    .int("Informe dias inteiros.")
    .min(1, "O teste vai de 1 a 90 dias.")
    .max(90, "O teste vai de 1 a 90 dias."),
});

export type CreateTenantByAdminInput = z.input<typeof createTenantSchema>;

/**
 * Cria um estabelecimento e o dono (sem senha, e-mail ainda não confirmado: o
 * dono define a senha por "esqueci minha senha" ou pelo convite). Plano e
 * prazo de teste são os escolhidos pelo super-admin.
 */
export async function createTenantByAdmin(
  db: Db,
  actor: AdminActor,
  input: CreateTenantByAdminInput,
  now: Date = new Date(),
): Promise<{ tenantId: string; userId: string; slug: string }> {
  const parsed = createTenantSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = toFieldErrors(parsed.error);
    throw new PlatformError(
      "validation",
      Object.values(fieldErrors)[0] ?? "Dados inválidos.",
      fieldErrors,
    );
  }
  const data = parsed.data;
  const email = normalizeEmail(data.ownerEmail);

  const [plan] = await db.select().from(plans).where(eq(plans.id, data.planId)).limit(1);
  if (!plan || !plan.active) {
    throw new PlatformError("validation", "Escolha um plano ativo.", {
      planId: "Escolha um plano ativo.",
    });
  }
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) throw new PlatformError("email_taken", EMAIL_TAKEN, { ownerEmail: EMAIL_TAKEN });

  try {
    return await createTenantWithOwner(
      db,
      {
        businessName: data.businessName,
        ownerName: data.ownerName,
        email,
        whatsapp: data.whatsapp,
        passwordHash: null,
        emailVerifiedAt: null,
      },
      now,
      async (tx, created) => {
        const trialEndsAt = new Date(now.getTime() + data.trialDays * DAY_MS);
        await tx
          .update(tenants)
          .set({ planId: plan.id, trialEndsAt })
          .where(eq(tenants.id, created.tenantId));
        await audit(tx, actor, created.tenantId, "tenant.created_by_admin", {
          plan: plan.code,
          trialDays: data.trialDays,
          ownerEmail: email,
        });
      },
    );
  } catch (error) {
    if (error instanceof AuthError && error.code === "email_taken") {
      throw new PlatformError("email_taken", EMAIL_TAKEN, { ownerEmail: EMAIL_TAKEN });
    }
    throw error;
  }
}
