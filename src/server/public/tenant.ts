import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  memberships,
  professionalServices,
  professionals,
  services,
  tenants,
  users,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { ensureReadableBrandColor, isHexColor } from "@/lib/color";
import { normalizeBrazilPhone } from "@/lib/phone";
import { withTenant } from "@/server/tenant-db";
import { RESERVED_SLUGS } from "@/server/tenants/slug";

/** Cor da marca Eneven, usada quando o salão não escolheu uma. */
export const DEFAULT_BRAND_COLOR = "#3E07D2";

const SLUG_FORMAT = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

/** O que a página pública pode saber do estabelecimento (nada de ids de usuários, status, etc.). */
export type PublicTenant = {
  id: string;
  slug: string;
  name: string;
  /** Já ajustada para dar contraste AA com texto branco. */
  brandColor: string;
  /** Caminho de `/api/logo/{slug}` quando há logo; senão `null` (iniciais). */
  logoUrl: string | null;
  /** Só dígitos com `55`, pronto para `wa.me`. */
  whatsapp: string | null;
  address: string | null;
  about: string | null;
  instagram: string | null;
  timezone: string;
  maxDaysAhead: number;
  cancelWindowMin: number;
};

export type PublicReason = "email_unverified" | "inactive" | "no_services";

export type PublicTenantResult = {
  tenant: PublicTenant;
  canBook: boolean;
  reason?: PublicReason;
} | null;

type TenantRow = typeof tenants.$inferSelect;

export function toPublicTenant(row: TenantRow): PublicTenant {
  const color = row.brandColor && isHexColor(row.brandColor) ? row.brandColor : DEFAULT_BRAND_COLOR;
  const whatsapp = row.whatsapp
    ? (normalizeBrazilPhone(row.whatsapp) ?? (row.whatsapp.replace(/\D/g, "") || null))
    : null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brandColor: ensureReadableBrandColor(color).color,
    logoUrl: row.logoUrl,
    whatsapp,
    address: row.address,
    about: row.about,
    instagram: row.instagram,
    timezone: row.timezone,
    maxDaysAhead: row.maxDaysAhead,
    cancelWindowMin: row.cancelWindowMin,
  };
}

export type PublicService = {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  priceCents: number;
  /** Profissionais ativos que fazem este serviço. */
  professionalIds: string[];
};

export type PublicProfessional = { id: string; name: string; color: string | null };

export type PublicCatalog = {
  services: PublicService[];
  /** Só quem faz ao menos um serviço oferecido. */
  professionals: PublicProfessional[];
};

/**
 * Serviços que a página pública pode oferecer: visíveis, não arquivados e com
 * ao menos um profissional ativo que os faça (`loadAvailabilityContext` não
 * olha `visible`, então a regra mora aqui).
 */
export async function getPublicCatalog(db: Db, tenantId: string): Promise<PublicCatalog> {
  return withTenant(db, tenantId, async (tx) => {
    const serviceRows = await tx
      .select()
      .from(services)
      .where(
        and(
          eq(services.tenantId, tenantId),
          eq(services.visible, true),
          isNull(services.archivedAt),
        ),
      )
      .orderBy(asc(services.sortOrder), asc(services.createdAt), asc(services.id));
    if (serviceRows.length === 0) return { services: [], professionals: [] };

    const proRows = await tx
      .select({ id: professionals.id, name: professionals.name, color: professionals.color })
      .from(professionals)
      .where(and(eq(professionals.tenantId, tenantId), eq(professionals.active, true)))
      .orderBy(asc(professionals.sortOrder), asc(professionals.createdAt), asc(professionals.id));
    if (proRows.length === 0) return { services: [], professionals: [] };

    const links = await tx
      .select({
        serviceId: professionalServices.serviceId,
        professionalId: professionalServices.professionalId,
      })
      .from(professionalServices)
      .where(
        and(
          eq(professionalServices.tenantId, tenantId),
          inArray(
            professionalServices.serviceId,
            serviceRows.map((s) => s.id),
          ),
          inArray(
            professionalServices.professionalId,
            proRows.map((p) => p.id),
          ),
        ),
      );

    const byService = new Map<string, Set<string>>();
    for (const link of links) {
      const set = byService.get(link.serviceId) ?? new Set<string>();
      set.add(link.professionalId);
      byService.set(link.serviceId, set);
    }

    const offered = serviceRows
      .filter((s) => (byService.get(s.id)?.size ?? 0) > 0)
      .map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        durationMin: s.durationMin,
        priceCents: s.priceCents,
        // Mantém a ordem da equipe.
        professionalIds: proRows.filter((p) => byService.get(s.id)!.has(p.id)).map((p) => p.id),
      }));
    const used = new Set(offered.flatMap((s) => s.professionalIds));
    return { services: offered, professionals: proRows.filter((p) => used.has(p.id)) };
  });
}

/**
 * Resolve o estabelecimento da página pública pelo slug (no servidor, a cada
 * chamada; nada de ids vindos do cliente) e diz se ele pode receber
 * agendamentos. `canBook` exige: e-mail do dono confirmado, status `active` ou
 * `trial` dentro do prazo e ao menos um serviço visível com profissional ativo.
 * Slug inválido, reservado ou inexistente devolve `null`.
 */
export async function getPublicTenant(
  slug: string,
  options: { db?: Db; now?: Date } = {},
): Promise<PublicTenantResult> {
  const normalized = slug.trim().toLowerCase();
  if (!SLUG_FORMAT.test(normalized) || RESERVED_SLUGS.includes(normalized)) return null;

  const db = options.db ?? (await getDb());
  const now = options.now ?? new Date();
  const [row] = await db.select().from(tenants).where(eq(tenants.slug, normalized)).limit(1);
  if (!row) return null;
  const tenant = toPublicTenant(row);

  const [verifiedOwner] = await db
    .select({ id: users.id })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.tenantId, row.id),
        eq(memberships.role, "owner"),
        isNotNull(users.emailVerifiedAt),
      ),
    )
    .limit(1);
  if (!verifiedOwner) return { tenant, canBook: false, reason: "email_unverified" };

  const active =
    row.status === "active" ||
    (row.status === "trial" && row.trialEndsAt.getTime() > now.getTime());
  if (!active) return { tenant, canBook: false, reason: "inactive" };

  const catalog = await getPublicCatalog(db, row.id);
  if (catalog.services.length === 0) return { tenant, canBook: false, reason: "no_services" };

  return { tenant, canBook: true };
}
