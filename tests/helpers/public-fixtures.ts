import { randomUUID } from "node:crypto";
import {
  businessHours,
  memberships,
  professionalHours,
  professionalServices,
  professionals,
  services,
  tenants,
  users,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { getDefaultPlanId } from "@/server/platform/plans";

export type PublicSeed = {
  tenantId: string;
  slug: string;
  ownerId: string;
  /** Profissionais em ordem de criação. */
  proIds: string[];
  /** Serviços em ordem de criação. */
  serviceIds: string[];
};

type Options = {
  slug?: string;
  verified?: boolean;
  status?: (typeof tenants.$inferInsert)["status"];
  trialEndsAt?: Date;
  /** Quantos profissionais ativos (todos fazem todos os serviços). */
  pros?: number;
  /** Quantos serviços visíveis. */
  servicesCount?: number;
  tenant?: Partial<typeof tenants.$inferInsert>;
};

/**
 * Estabelecimento pronto para agendar: dono com e-mail confirmado, expediente
 * de segunda a sábado (9h–18h) e profissionais/serviços ligados entre si.
 */
export async function seedBookable(db: Db, options: Options = {}): Promise<PublicSeed> {
  const slug = options.slug ?? `loja-${randomUUID().slice(0, 8)}`;
  const [tenant] = await db
    .insert(tenants)
    .values({
      slug,
      name: "Studio Defendi",
      status: options.status ?? "trial",
      trialEndsAt: options.trialEndsAt ?? new Date("2099-01-01T00:00:00.000Z"),
      planId: await getDefaultPlanId(db),
      slotIntervalMin: 30,
      minNoticeMin: 60,
      maxDaysAhead: 30,
      cancelWindowMin: 120,
      ...options.tenant,
    })
    .returning();
  const tenantId = tenant.id;

  const [owner] = await db
    .insert(users)
    .values({
      email: `${randomUUID()}@exemplo.com`,
      name: "Dona",
      emailVerifiedAt: options.verified === false ? null : new Date(),
    })
    .returning();
  await db.insert(memberships).values({ userId: owner.id, tenantId, role: "owner" });

  const week = [1, 2, 3, 4, 5, 6];
  await db
    .insert(businessHours)
    .values(week.map((weekday) => ({ tenantId, weekday, startsAt: "09:00", endsAt: "18:00" })));

  const serviceIds: string[] = [];
  for (let i = 0; i < (options.servicesCount ?? 1); i++) {
    const [service] = await db
      .insert(services)
      .values({
        tenantId,
        name: i === 0 ? "Corte" : `Serviço ${i + 1}`,
        durationMin: 30,
        priceCents: 9000,
        sortOrder: i,
      })
      .returning();
    serviceIds.push(service.id);
  }

  const proIds: string[] = [];
  for (let i = 0; i < (options.pros ?? 1); i++) {
    const [pro] = await db
      .insert(professionals)
      .values({ tenantId, name: i === 0 ? "Bia" : `Pro ${i + 1}`, sortOrder: i })
      .returning();
    proIds.push(pro.id);
    await db
      .insert(professionalHours)
      .values(week.map((weekday) => ({ tenantId, professionalId: pro.id, weekday, startsAt: "09:00", endsAt: "18:00" })));
    await db
      .insert(professionalServices)
      .values(serviceIds.map((serviceId) => ({ tenantId, professionalId: pro.id, serviceId })));
  }

  return { tenantId, slug, ownerId: owner.id, proIds, serviceIds };
}
