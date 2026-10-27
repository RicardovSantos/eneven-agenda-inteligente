import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { memberships, professionals, users } from "@/db/schema";
import { signup } from "@/server/auth/signup";
import { acceptInvitation } from "@/server/team/accept";
import { TeamError } from "@/server/team/errors";
import { inviteMember, type TeamActor } from "@/server/team/invitations";
import { resetRateLimitsForTests } from "@/server/security/limits";
import { withTenant } from "@/server/tenant-db";
import { seedProfessional } from "../helpers/agenda-fixtures";
import { connectPg } from "./pg-db";

const pg = connectPg();
const { db } = pg;

beforeEach(async () => {
  resetRateLimitsForTests();
  vi.spyOn(console, "info").mockImplementation(() => {});
  await pg.truncate();
});

afterAll(async () => {
  await pg.close();
});

describe("aceite simultâneo de convites (PostgreSQL real)", () => {
  it("dois acceptInvitation em paralelo: um cria o vínculo, o outro recebe invalid_invitation", async () => {
    const account = await signup(db, {
      businessName: "Studio Race",
      ownerName: "Dona",
      email: "dona@race.com",
      password: "senha-forte-1",
      whatsapp: "11999999999",
    });
    const owner: TeamActor = { tenantId: account.tenantId, userId: account.userId, role: "owner" };
    const pro = await seedProfessional(db, account.tenantId, "Bia");
    const { token } = await inviteMember(
      db,
      owner,
      { name: "Bia", email: "bia@race.com", role: "staff", professionalId: pro.id },
      new Date(),
    );

    const attempt = () =>
      acceptInvitation(db, token, { name: "Bia", password: "senha-da-equipe-1" });
    const results = await Promise.allSettled([attempt(), attempt()]);

    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBeInstanceOf(TeamError);
    expect((failed[0].reason as TeamError).code).toBe("invalid_invitation");

    const bia = await db.select().from(users).where(eq(users.email, "bia@race.com"));
    expect(bia).toHaveLength(1);
    expect(
      await db.select().from(memberships).where(eq(memberships.userId, bia[0].id)),
    ).toHaveLength(1);
    const [row] = await withTenant(db, account.tenantId, (tx) =>
      tx.select().from(professionals).where(eq(professionals.id, pro.id)),
    );
    expect(row.userId).toBe(bia[0].id);
  });
});
