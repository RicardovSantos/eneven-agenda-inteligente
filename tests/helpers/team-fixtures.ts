import { eq } from "drizzle-orm";
import { memberships, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { signup } from "@/server/auth/signup";
import type { TeamActor } from "@/server/team/invitations";

export const NOW = new Date("2026-10-27T12:00:00Z");
export const DAY = 86_400_000;

/** Estabelecimento com proprietário (e-mail confirmado) e o `actor` dele. */
export async function seedOwnerTenant(db: Db, name: string, email: string) {
  const account = await signup(db, {
    businessName: name,
    ownerName: "Dona",
    email,
    password: "senha-forte-1",
    whatsapp: "11999999999",
  });
  await db.update(users).set({ emailVerifiedAt: NOW }).where(eq(users.id, account.userId));
  const actor: TeamActor = { tenantId: account.tenantId, userId: account.userId, role: "owner" };
  return { ...account, actor };
}

export async function membershipsOf(db: Db, userId: string) {
  return db.select().from(memberships).where(eq(memberships.userId, userId));
}
