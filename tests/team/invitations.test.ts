import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invitations, memberships, professionals, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { hashToken } from "@/server/auth/session";
import { resetRateLimitsForTests } from "@/server/security/limits";
import {
  createOwnerAccessInvite,
  createOwnerAccessInviteForTests,
  INVITE_TTL_DAYS,
  inviteMember,
  inviteMemberForTests,
  resendInvitation,
  resendInvitationForTests,
  revokeInvitation,
  type TeamActor,
} from "@/server/team/invitations";
import { listTeamAccess } from "@/server/team/members";
import { withTenant } from "@/server/tenant-db";
import { seedProfessional } from "../helpers/agenda-fixtures";
import { DAY, failureOf, NOW, seedOwnerTenant } from "../helpers/team-fixtures";
import { createTestDb } from "../helpers/test-db";

describe("convites da equipe", () => {
  let db: Db;
  let tenantId: string;
  let owner: TeamActor;
  let ownerUserId: string;

  beforeEach(async () => {
    resetRateLimitsForTests();
    vi.spyOn(console, "info").mockImplementation(() => {});
    db = await createTestDb();
    const t = await seedOwnerTenant(db, "Studio <Bela>", "dona@studio.com");
    tenantId = t.tenantId;
    owner = t.actor;
    ownerUserId = t.userId;
  });

  it("convida recepção: aparece como invite, com validade de 7 dias e token só em hash", async () => {
    const { invitationId, token } = await inviteMemberForTests(
      db,
      owner,
      { name: "Rita", email: "  Rita@Exemplo.com ", role: "reception" },
      NOW,
    );
    const [row] = await withTenant(db, tenantId, (tx) =>
      tx.select().from(invitations).where(eq(invitations.id, invitationId)),
    );
    expect(row.email).toBe("rita@exemplo.com");
    expect(row.role).toBe("reception");
    expect(row.tokenHash).toBe(hashToken(token));
    expect(row.tokenHash).not.toBe(token);
    expect(row.invitedByUserId).toBe(ownerUserId);
    expect(row.expiresAt.getTime()).toBe(NOW.getTime() + INVITE_TTL_DAYS * DAY);

    const rows = await listTeamAccess(db, tenantId, NOW);
    expect(rows[0]).toMatchObject({ kind: "member", role: "owner", email: "dona@studio.com" });
    expect(rows[1]).toMatchObject({
      kind: "invite",
      invitationId,
      email: "rita@exemplo.com",
      role: "reception",
      professionalName: null,
      expired: false,
    });
  });

  it("envia o e-mail com o link /convite/{token}", async () => {
    const info = vi.spyOn(console, "info");
    const { token } = await inviteMemberForTests(
      db,
      owner,
      { name: "Rita", email: "rita@exemplo.com", role: "reception" },
      NOW,
    );
    expect(info).toHaveBeenCalledWith(expect.stringContaining(`/convite/${token}`));
    expect(info).toHaveBeenCalledWith(expect.stringContaining("convidou você para a agenda"));
  });

  it("convite de profissional exige professionalId ativo e livre do estabelecimento", async () => {
    const e1 = await failureOf(
      inviteMember(db, owner, { name: "Bia", email: "bia@x.com", role: "staff" }, NOW),
    );
    expect(e1.code).toBe("validation");
    expect(e1.fieldErrors?.professionalId).toBeTruthy();

    const other = await seedOwnerTenant(db, "Outro", "outra@outro.com");
    const foreign = await seedProfessional(db, other.tenantId, "De fora");
    const e2 = await failureOf(
      inviteMember(
        db,
        owner,
        { name: "Bia", email: "bia@x.com", role: "staff", professionalId: foreign.id },
        NOW,
      ),
    );
    expect(e2.code).toBe("validation");

    const inactive = await seedProfessional(db, tenantId, "Inativa");
    await db.update(professionals).set({ active: false }).where(eq(professionals.id, inactive.id));
    const e3 = await failureOf(
      inviteMember(
        db,
        owner,
        { name: "Bia", email: "bia@x.com", role: "staff", professionalId: inactive.id },
        NOW,
      ),
    );
    expect(e3.code).toBe("validation");

    const linked = await seedProfessional(db, tenantId, "Ligada");
    await db.update(professionals).set({ userId: ownerUserId }).where(eq(professionals.id, linked.id));
    const e4 = await failureOf(
      inviteMember(
        db,
        owner,
        { name: "Bia", email: "bia@x.com", role: "staff", professionalId: linked.id },
        NOW,
      ),
    );
    expect(e4.code).toBe("validation");

    const free = await seedProfessional(db, tenantId, "Livre");
    await inviteMember(
      db,
      owner,
      { name: "Bia", email: "bia@x.com", role: "staff", professionalId: free.id },
      NOW,
    );
    const rows = await listTeamAccess(db, tenantId, NOW);
    expect(rows.find((r) => r.kind === "invite")).toMatchObject({
      role: "staff",
      professionalName: "Livre",
    });
  });

  it("recepção ignora professionalId", async () => {
    const pro = await seedProfessional(db, tenantId, "Livre");
    const { invitationId } = await inviteMember(
      db,
      owner,
      { name: "Rita", email: "rita@x.com", role: "reception", professionalId: pro.id },
      NOW,
    );
    const [row] = await withTenant(db, tenantId, (tx) =>
      tx.select().from(invitations).where(eq(invitations.id, invitationId)),
    );
    expect(row.professionalId).toBeNull();
  });

  it("e-mail que já é membro: 'Essa pessoa já tem acesso.'", async () => {
    const e = await failureOf(
      inviteMember(db, owner, { name: "Dona", email: "DONA@studio.com", role: "reception" }, NOW),
    );
    expect(e.code).toBe("already_member");
    expect(e.message).toBe("Essa pessoa já tem acesso.");
  });

  it("e-mail ligado a outro estabelecimento: mensagem exata", async () => {
    await seedOwnerTenant(db, "Outro", "outra@outro.com");
    const e = await failureOf(
      inviteMember(db, owner, { name: "X", email: "outra@outro.com", role: "reception" }, NOW),
    );
    expect(e.code).toBe("other_tenant");
    expect(e.message).toBe("Esse e-mail já está ligado a outro estabelecimento.");
  });

  it("valida nome e e-mail", async () => {
    const e = await failureOf(
      inviteMember(db, owner, { name: " ", email: "nao-e-email", role: "reception" }, NOW),
    );
    expect(e.code).toBe("validation");
    expect(e.fieldErrors?.name).toBeTruthy();
    expect(e.fieldErrors?.email).toBeTruthy();
  });

  it("recepção e profissional não convidam (forbidden)", async () => {
    for (const role of ["reception", "staff"] as const) {
      const e = await failureOf(
        inviteMember(
          db,
          { ...owner, role },
          { name: "X", email: "x@x.com", role: "reception" },
          NOW,
        ),
      );
      expect(e.code).toBe("forbidden");
    }
  });

  it("não aceita papel owner vindo da entrada", async () => {
    const e = await failureOf(
      inviteMember(
        db,
        owner,
        { name: "X", email: "x@x.com", role: "owner" as unknown as "reception" },
        NOW,
      ),
    );
    expect(e.code).toBe("validation");
  });

  it("novo convite para o mesmo e-mail revoga o pendente anterior", async () => {
    const first = await inviteMember(
      db,
      owner,
      { name: "Rita", email: "rita@x.com", role: "reception" },
      NOW,
    );
    const second = await inviteMember(
      db,
      owner,
      { name: "Rita", email: "rita@x.com", role: "reception" },
      NOW,
    );
    const rows = await listTeamAccess(db, tenantId, NOW);
    const invites = rows.filter((r) => r.kind === "invite");
    expect(invites).toHaveLength(1);
    expect(invites[0]).toMatchObject({ invitationId: second.invitationId });
    const [old] = await withTenant(db, tenantId, (tx) =>
      tx.select().from(invitations).where(eq(invitations.id, first.invitationId)),
    );
    expect(old.revokedAt).not.toBeNull();
  });

  it("limite de 20 convites por dia por estabelecimento", async () => {
    for (let i = 0; i < 20; i++) {
      await inviteMember(
        db,
        owner,
        { name: "P", email: `p${i}@x.com`, role: "reception" },
        NOW,
      );
    }
    const e = await failureOf(
      inviteMember(db, owner, { name: "P", email: "p21@x.com", role: "reception" }, NOW),
    );
    expect(e.code).toBe("rate_limited");
  });

  it("convite vencido aparece como expired", async () => {
    await inviteMember(db, owner, { name: "R", email: "r@x.com", role: "reception" }, NOW);
    const later = new Date(NOW.getTime() + 8 * DAY);
    const rows = await listTeamAccess(db, tenantId, later);
    expect(rows.find((r) => r.kind === "invite")).toMatchObject({ expired: true });
  });

  it("revogar tira o convite da lista; recepção não revoga; de outro tenant não existe", async () => {
    const { invitationId } = await inviteMember(
      db,
      owner,
      { name: "R", email: "r@x.com", role: "reception" },
      NOW,
    );
    const asReception = await failureOf(
      revokeInvitation(db, { ...owner, role: "reception" }, invitationId),
    );
    expect(asReception.code).toBe("forbidden");
    const other = await seedOwnerTenant(db, "Outro", "outra@outro.com");
    expect((await failureOf(revokeInvitation(db, other.actor, invitationId))).code).toBe(
      "not_found",
    );

    await revokeInvitation(db, owner, invitationId, NOW);
    expect(
      (await listTeamAccess(db, tenantId, NOW)).filter((r) => r.kind === "invite"),
    ).toHaveLength(0);
    expect((await failureOf(revokeInvitation(db, owner, invitationId))).code).toBe("not_found");
  });

  it("reenviar gera novo token (o antigo deixa de valer) e renova a validade", async () => {
    const { invitationId, token } = await inviteMemberForTests(
      db,
      owner,
      { name: "R", email: "r@x.com", role: "reception" },
      NOW,
    );
    const later = new Date(NOW.getTime() + 5 * DAY);
    const resent = await resendInvitationForTests(db, owner, invitationId, later);
    expect(resent.token).not.toBe(token);
    const [row] = await withTenant(db, tenantId, (tx) =>
      tx.select().from(invitations).where(eq(invitations.id, invitationId)),
    );
    expect(row.tokenHash).toBe(hashToken(resent.token));
    expect(row.sentAt.getTime()).toBe(later.getTime());
    expect(row.expiresAt.getTime()).toBe(later.getTime() + INVITE_TTL_DAYS * DAY);
    const asStaff = await failureOf(resendInvitation(db, { ...owner, role: "staff" }, invitationId));
    expect(asStaff.code).toBe("forbidden");
  });

  it("createOwnerAccessInvite cria convite owner para o dono atual", async () => {
    const admin = (await seedOwnerTenant(db, "Plataforma", "admin@eneven.com")).userId;
    const { invitationId, token } = await createOwnerAccessInviteForTests(db, tenantId, admin, NOW);
    const [row] = await withTenant(db, tenantId, (tx) =>
      tx.select().from(invitations).where(eq(invitations.id, invitationId)),
    );
    expect(row).toMatchObject({ role: "owner", email: "dona@studio.com", invitedByUserId: admin });
    expect(row.tokenHash).toBe(hashToken(token));
    // convite de dono não aparece na lista da equipe
    expect(
      (await listTeamAccess(db, tenantId, NOW)).filter((r) => r.kind === "invite"),
    ).toHaveLength(0);
    // nem é gerenciado pelo painel do estabelecimento
    expect((await failureOf(revokeInvitation(db, owner, invitationId))).code).toBe("forbidden");
    expect((await failureOf(resendInvitation(db, owner, invitationId))).code).toBe("forbidden");
    expect(
      await db.select().from(memberships).where(eq(memberships.tenantId, tenantId)),
    ).toHaveLength(1);
  });

  it("as funções públicas NÃO devolvem o token (só o e-mail leva o link)", async () => {
    const info = vi.spyOn(console, "info");
    const invited = await inviteMember(
      db,
      owner,
      { name: "Rita", email: "rita@x.com", role: "reception" },
      NOW,
    );
    expect(Object.keys(invited).sort()).toEqual(["emailSent", "invitationId"]);
    const link = (info.mock.calls.at(-1)?.[0] as string).match(/\/convite\/([^\s]+)/)?.[1];
    expect(link).toBeTruthy();
    expect(JSON.stringify(invited)).not.toContain(link as string);

    const resent = await resendInvitation(db, owner, invited.invitationId, NOW);
    expect(Object.keys(resent).sort()).toEqual(["emailSent", "invitationId"]);

    const admin = (await seedOwnerTenant(db, "Plataforma", "admin@eneven.com")).userId;
    const ownerInvite = await createOwnerAccessInvite(db, tenantId, admin, NOW);
    expect(Object.keys(ownerInvite).sort()).toEqual(["emailSent", "invitationId"]);
  });

  it("reenviar refaz as checagens: e-mail que virou membro/ligado a outro estabelecimento e profissional indisponível", async () => {
    const pro = await seedProfessional(db, tenantId, "Bia");
    const staff = await inviteMember(
      db,
      owner,
      { name: "Bia", email: "bia@x.com", role: "staff", professionalId: pro.id },
      NOW,
    );
    await db.update(professionals).set({ userId: ownerUserId }).where(eq(professionals.id, pro.id));
    const e1 = await failureOf(resendInvitation(db, owner, staff.invitationId, NOW));
    expect(e1.code).toBe("validation");
    expect(e1.fieldErrors?.professionalId).toBeTruthy();
    await db.update(professionals).set({ userId: null }).where(eq(professionals.id, pro.id));
    await db.update(professionals).set({ active: false }).where(eq(professionals.id, pro.id));
    expect((await failureOf(resendInvitation(db, owner, staff.invitationId, NOW))).code).toBe(
      "validation",
    );
    await db.update(professionals).set({ active: true }).where(eq(professionals.id, pro.id));
    await resendInvitation(db, owner, staff.invitationId, NOW);

    const other = await seedOwnerTenant(db, "Outro", "outra@outro.com");
    const rita = await inviteMember(db, owner, { name: "R", email: "rita@x.com", role: "reception" }, NOW);
    // o e-mail passou a pertencer a outro estabelecimento depois do convite
    const [ritaUser] = await db
      .insert(users)
      .values({ email: "rita@x.com", name: "Rita", emailVerifiedAt: NOW })
      .returning();
    await db.insert(memberships).values({ userId: ritaUser.id, tenantId: other.tenantId, role: "reception" });
    expect((await failureOf(resendInvitation(db, owner, rita.invitationId, NOW))).code).toBe(
      "other_tenant",
    );
    // ... e depois ao próprio estabelecimento
    await db.delete(memberships).where(eq(memberships.userId, ritaUser.id));
    await db.insert(memberships).values({ userId: ritaUser.id, tenantId, role: "reception" });
    const again = await failureOf(resendInvitation(db, owner, rita.invitationId, NOW));
    expect(again.code).toBe("already_member");
    expect(again.message).toBe("Essa pessoa já tem acesso.");
  });
});
