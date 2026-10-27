import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memberships, professionals, sessions, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { createSession } from "@/server/auth/session";
import { resetRateLimitsForTests } from "@/server/security/limits";
import { acceptInvitation } from "@/server/team/accept";
import { TeamError } from "@/server/team/errors";
import { inviteMember, type TeamActor } from "@/server/team/invitations";
import { listTeamAccess, removeMember } from "@/server/team/members";
import { withTenant } from "@/server/tenant-db";
import { seedProfessional } from "../helpers/agenda-fixtures";
import { membershipsOf, NOW, seedOwnerTenant } from "../helpers/team-fixtures";
import { createTestDb } from "../helpers/test-db";

async function failureOf(promise: Promise<unknown>): Promise<TeamError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(TeamError);
    return error as TeamError;
  }
  throw new Error("esperava TeamError");
}

describe("acessos da equipe", () => {
  let db: Db;
  let tenantId: string;
  let owner: TeamActor;

  async function join(role: "reception" | "staff", email: string, professionalId?: string) {
    const { token } = await inviteMember(db, owner, { name: email, email, role, professionalId }, NOW);
    return acceptInvitation(db, token, { name: `Nome ${email}`, password: "senha-da-equipe-1" }, NOW);
  }

  beforeEach(async () => {
    resetRateLimitsForTests();
    vi.spyOn(console, "info").mockImplementation(() => {});
    db = await createTestDb();
    const t = await seedOwnerTenant(db, "Studio", "dona@studio.com");
    tenantId = t.tenantId;
    owner = t.actor;
  });

  it("listTeamAccess: dono primeiro, depois membros, depois convites, com nome do profissional", async () => {
    const bia = await seedProfessional(db, tenantId, "Bia");
    const caio = await seedProfessional(db, tenantId, "Caio");
    await join("reception", "rita@x.com");
    await join("staff", "bia@x.com", bia.id);
    await inviteMember(db, owner, { name: "Caio", email: "caio@x.com", role: "staff", professionalId: caio.id }, NOW);

    const rows = await listTeamAccess(db, tenantId, NOW);
    expect(rows.map((r) => `${r.kind}:${r.email}`)).toEqual([
      "member:dona@studio.com",
      "member:rita@x.com",
      "member:bia@x.com",
      "invite:caio@x.com",
    ]);
    expect(rows[0]).toMatchObject({ role: "owner", professionalName: null });
    expect(rows[2]).toMatchObject({ role: "staff", professionalName: "Bia", name: "Nome bia@x.com" });
    expect(rows[3]).toMatchObject({ kind: "invite", professionalName: "Caio", expired: false });
  });

  it("listTeamAccess não mistura estabelecimentos", async () => {
    await join("reception", "rita@x.com");
    const other = await seedOwnerTenant(db, "Outro", "outra@outro.com");
    const rows = await listTeamAccess(db, other.tenantId, NOW);
    expect(rows.map((r) => r.email)).toEqual(["outra@outro.com"]);
  });

  it("removeMember apaga vínculo, sessões deste tenant e solta o profissional", async () => {
    const bia = await seedProfessional(db, tenantId, "Bia");
    const { userId } = await join("staff", "bia@x.com", bia.id);
    await createSession(db, userId, tenantId);
    await createSession(db, userId, null); // sessão sem tenant (não é deste estabelecimento)

    await removeMember(db, owner, userId);

    expect(await membershipsOf(db, userId)).toHaveLength(0);
    const left = await db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(left).toHaveLength(1);
    expect(left[0].tenantId).toBeNull();
    const [pro] = await withTenant(db, tenantId, (tx) =>
      tx.select().from(professionals).where(eq(professionals.id, bia.id)),
    );
    expect(pro.userId).toBeNull();
    // o usuário em si continua existindo
    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(1);
  });

  it("removeMember não toca em sessões de outro estabelecimento do mesmo usuário", async () => {
    const { userId } = await join("reception", "rita@x.com");
    const other = await seedOwnerTenant(db, "Outro", "outra@outro.com");
    await db.insert(memberships).values({ userId, tenantId: other.tenantId, role: "reception" });
    await createSession(db, userId, other.tenantId);
    await createSession(db, userId, tenantId);

    await removeMember(db, owner, userId);

    const left = await db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(left.map((s) => s.tenantId)).toEqual([other.tenantId]);
    expect(
      await db
        .select()
        .from(memberships)
        .where(and(eq(memberships.userId, userId), eq(memberships.tenantId, other.tenantId))),
    ).toHaveLength(1);
  });

  it("removeMember só solta profissionais deste estabelecimento", async () => {
    const { userId } = await join("reception", "rita@x.com");
    const other = await seedOwnerTenant(db, "Outro", "outra@outro.com");
    const foreign = await seedProfessional(db, other.tenantId, "De fora");
    await db.update(professionals).set({ userId }).where(eq(professionals.id, foreign.id));
    await removeMember(db, owner, userId);
    const [row] = await db.select().from(professionals).where(eq(professionals.id, foreign.id));
    expect(row.userId).toBe(userId);
  });

  it("proprietário não pode ser removido", async () => {
    const e = await failureOf(removeMember(db, owner, owner.userId));
    expect(e.code).toBe("forbidden");
    expect(await membershipsOf(db, owner.userId)).toHaveLength(1);
  });

  it("só o proprietário remove; recepção e profissional recebem forbidden", async () => {
    const { userId } = await join("reception", "rita@x.com");
    const { userId: other } = await join("reception", "joao@x.com");
    for (const role of ["reception", "staff"] as const) {
      const e = await failureOf(removeMember(db, { tenantId, userId, role }, other));
      expect(e.code).toBe("forbidden");
    }
    expect(await membershipsOf(db, other)).toHaveLength(1);
  });

  it("usuário de outro estabelecimento não é encontrado (e nada é removido)", async () => {
    const other = await seedOwnerTenant(db, "Outro", "outra@outro.com");
    const e = await failureOf(removeMember(db, owner, other.userId));
    expect(e.code).toBe("not_found");
    expect(await membershipsOf(db, other.userId)).toHaveLength(1);
  });
});
