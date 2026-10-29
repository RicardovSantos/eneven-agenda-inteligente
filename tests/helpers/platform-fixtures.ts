import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { memberships, plans, tenants, users } from "@/db/schema";
import type { Db } from "@/db/types";

export const NOW = new Date("2026-10-27T12:00:00Z");
export const DAY = 86_400_000;

export async function planId(db: Db, code: "essencial" | "profissional" | "studio") {
  const [plan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.code, code));
  return plan.id;
}

type Seed = {
  name?: string;
  plan?: "essencial" | "profissional" | "studio";
  status?: (typeof tenants.$inferInsert)["status"];
  trialEndsAt?: Date;
  activatedAt?: Date | null;
  createdAt?: Date;
  ownerEmail?: string;
  lastLoginAt?: Date | null;
};

/** Estabelecimento com dono (usuário + vínculo owner), sem passar pelo cadastro. */
export async function seedPlatformTenant(db: Db, seed: Seed = {}) {
  const id = randomUUID().slice(0, 8);
  const [tenant] = await db
    .insert(tenants)
    .values({
      slug: `loja-${id}`,
      name: seed.name ?? `Loja ${id}`,
      status: seed.status ?? "trial",
      trialEndsAt: seed.trialEndsAt ?? new Date(NOW.getTime() + 5 * DAY),
      activatedAt: seed.activatedAt ?? null,
      planId: await planId(db, seed.plan ?? "essencial"),
      ...(seed.createdAt ? { createdAt: seed.createdAt } : {}),
    })
    .returning();
  const [owner] = await db
    .insert(users)
    .values({
      email: seed.ownerEmail ?? `dono-${id}@exemplo.com`,
      name: `Dono ${id}`,
      passwordHash: "x",
      lastLoginAt: seed.lastLoginAt ?? null,
    })
    .returning();
  await db.insert(memberships).values({ userId: owner.id, tenantId: tenant.id, role: "owner" });
  return { tenant, owner };
}

export async function seedSuperAdmin(db: Db, email = "ricardo@eneven.com") {
  const [user] = await db
    .insert(users)
    .values({ email, name: "Ricardo", passwordHash: "x", isSuperAdmin: true })
    .returning();
  return user;
}
