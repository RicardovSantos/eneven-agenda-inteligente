import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invitations, memberships, oauthAccounts, professionals, sessions, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { scopedProfessionalId } from "@/server/agenda/panel-ops";
import { login, resolveLoginTenantId } from "@/server/auth/login";
import { hashPassword } from "@/server/auth/password";
import { createSession, getSession } from "@/server/auth/session";
import type { GoogleProfile } from "@/server/auth/google";
import { resetRateLimitsForTests } from "@/server/security/limits";
import { acceptInvitation, getInvitation } from "@/server/team/accept";
import {
  createOwnerAccessInviteForTests as createOwnerAccessInvite,
  inviteMemberForTests as inviteMember,
  revokeInvitation,
  type TeamActor,
} from "@/server/team/invitations";
import { removeMember } from "@/server/team/members";
import { withTenant } from "@/server/tenant-db";
import { seedProfessional } from "../helpers/agenda-fixtures";
import { DAY, failureOf, membershipsOf, NOW, seedOwnerTenant } from "../helpers/team-fixtures";
import { createTestDb } from "../helpers/test-db";

const PASSWORD = "senha-da-equipe-1";

function google(over: Partial<GoogleProfile> = {}): GoogleProfile {
  return {
    sub: "google-sub-1",
    email: "rita@x.com",
    emailVerified: true,
    name: "Rita G",
    picture: null,
    ...over,
  };
}

describe("aceitar convites", () => {
  let db: Db;
  let tenantId: string;
  let owner: TeamActor;

  async function invite(
    role: "reception" | "staff" = "reception",
    email = "rita@x.com",
    professionalId?: string,
  ) {
    return inviteMember(db, owner, { name: "Rita", email, role, professionalId }, NOW);
  }

  async function plainUser(email: string, opts: { verified: boolean; password?: string | null }) {
    const [user] = await db
      .insert(users)
      .values({
        email,
        name: "Existente",
        passwordHash: opts.password === null ? null : await hashPassword(opts.password ?? "outra-senha-9"),
        emailVerifiedAt: opts.verified ? NOW : null,
      })
      .returning();
    return user;
  }

  beforeEach(async () => {
    resetRateLimitsForTests();
    vi.spyOn(console, "info").mockImplementation(() => {});
    db = await createTestDb();
    const t = await seedOwnerTenant(db, "Studio <Bela>", "dona@studio.com");
    tenantId = t.tenantId;
    owner = t.actor;
  });

  describe("getInvitation", () => {
    it("convite válido mostra estabelecimento, papel, e-mail e se já há conta", async () => {
      const { token } = await invite();
      expect(await getInvitation(db, token, NOW)).toEqual({
        status: "valid",
        tenantName: "Studio <Bela>",
        role: "reception",
        email: "rita@x.com",
        name: "Rita",
        hasAccount: false,
      });
      await plainUser("rita@x.com", { verified: true });
      expect(await getInvitation(db, token, NOW)).toMatchObject({ hasAccount: true });
    });

    it("token desconhecido, vazio, vencido, revogado ou usado é invalid", async () => {
      expect(await getInvitation(db, "nao-existe", NOW)).toEqual({ status: "invalid" });
      expect(await getInvitation(db, "", NOW)).toEqual({ status: "invalid" });

      const a = await invite();
      expect(await getInvitation(db, a.token, new Date(NOW.getTime() + 8 * DAY))).toEqual({
        status: "invalid",
      });

      const b = await invite("reception", "b@x.com");
      await revokeInvitation(db, owner, b.invitationId, NOW);
      expect(await getInvitation(db, b.token, NOW)).toEqual({ status: "invalid" });

      const c = await invite("reception", "c@x.com");
      await acceptInvitation(db, c.token, { name: "C", password: PASSWORD }, NOW);
      expect(await getInvitation(db, c.token, NOW)).toEqual({ status: "invalid" });
    });
  });

  describe("nome + senha", () => {
    it("cria usuário verificado, vínculo reception e a sessão só enxerga esse tenant", async () => {
      const { token } = await invite();
      const result = await acceptInvitation(db, token, { name: "Rita Souza", password: PASSWORD }, NOW);
      expect(result.tenantId).toBe(tenantId);

      const [user] = await db.select().from(users).where(eq(users.id, result.userId));
      expect(user).toMatchObject({ email: "rita@x.com", name: "Rita Souza" });
      expect(user.emailVerifiedAt?.getTime()).toBe(NOW.getTime());
      expect(user.passwordHash).toMatch(/^\$argon2id/);
      expect(await membershipsOf(db, user.id)).toEqual([
        { userId: user.id, tenantId, role: "reception" },
      ]);

      // não cria sessão sozinho
      expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);

      // login funciona com a senha escolhida e cai neste tenant
      expect(await login(db, "rita@x.com", PASSWORD)).toEqual({ userId: user.id });
      expect(await resolveLoginTenantId(db, user.id)).toBe(tenantId);
      const sessionToken = await createSession(db, user.id, tenantId);
      const session = await getSession(db, sessionToken);
      expect(session).toMatchObject({ userId: user.id, tenantId, role: "reception" });
    });

    it("usa a senha com as mesmas regras do cadastro e não gasta o convite se inválida", async () => {
      const { token } = await invite();
      const e = await failureOf(acceptInvitation(db, token, { name: "Rita", password: "curta" }, NOW));
      expect(e.code).toBe("validation");
      expect(e.fieldErrors?.password).toBe("A senha precisa ter pelo menos 8 caracteres.");
      const blank = await failureOf(acceptInvitation(db, token, { name: " ", password: PASSWORD }, NOW));
      expect(blank.fieldErrors?.name).toBeTruthy();
      expect(await getInvitation(db, token, NOW)).toMatchObject({ status: "valid" });
    });

    it("aceitar profissional liga professionals.user_id e scopedProfessionalId devolve o profissional", async () => {
      const pro = await seedProfessional(db, tenantId, "Bia");
      const { token } = await invite("staff", "bia@x.com", pro.id);
      const { userId } = await acceptInvitation(db, token, { name: "Bia", password: PASSWORD }, NOW);

      const [row] = await withTenant(db, tenantId, (tx) =>
        tx.select().from(professionals).where(eq(professionals.id, pro.id)),
      );
      expect(row.userId).toBe(userId);
      expect(await membershipsOf(db, userId)).toEqual([{ userId, tenantId, role: "staff" }]);
      expect(await scopedProfessionalId(db, { tenantId, userId, role: "staff" })).toBe(pro.id);
    });

    it("segundo aceite (sequencial) é invalid_invitation e não duplica nada", async () => {
      const { token } = await invite();
      await acceptInvitation(db, token, { name: "Rita", password: PASSWORD }, NOW);
      const e = await failureOf(
        acceptInvitation(db, token, { name: "Rita", password: PASSWORD }, NOW),
      );
      expect(e.code).toBe("invalid_invitation");
      expect(await db.select().from(memberships).where(eq(memberships.tenantId, tenantId))).toHaveLength(2);
    });

    it("vencido (8 dias), revogado e token inexistente são invalid_invitation", async () => {
      const a = await invite();
      const late = new Date(NOW.getTime() + 8 * DAY);
      expect(
        (await failureOf(acceptInvitation(db, a.token, { name: "R", password: PASSWORD }, late))).code,
      ).toBe("invalid_invitation");

      const b = await invite("reception", "b@x.com");
      await revokeInvitation(db, owner, b.invitationId, NOW);
      expect(
        (await failureOf(acceptInvitation(db, b.token, { name: "B", password: PASSWORD }, NOW))).code,
      ).toBe("invalid_invitation");

      expect(
        (await failureOf(acceptInvitation(db, "xxxx", { name: "B", password: PASSWORD }, NOW))).code,
      ).toBe("invalid_invitation");
      expect(await db.select().from(users).where(eq(users.email, "b@x.com"))).toHaveLength(0);
    });

    it("convite substituído (revogado) deixa de valer, o novo vale", async () => {
      const first = await invite();
      const second = await invite();
      expect(
        (await failureOf(acceptInvitation(db, first.token, { name: "R", password: PASSWORD }, NOW))).code,
      ).toBe("invalid_invitation");
      await acceptInvitation(db, second.token, { name: "R", password: PASSWORD }, NOW);
    });

    it("e-mail que já tem conta não pode ser tomado pelo link: precisa entrar (senha intacta)", async () => {
      const existing = await plainUser("rita@x.com", { verified: true, password: "senha-original-1" });
      const { token } = await invite();
      const e = await failureOf(acceptInvitation(db, token, { name: "Rita", password: PASSWORD }, NOW));
      expect(e.code).toBe("wrong_account");
      expect(e.message).toBe("Entre com rita@x.com para aceitar.");
      expect(await login(db, "rita@x.com", "senha-original-1")).toEqual({ userId: existing.id });
      expect(await membershipsOf(db, existing.id)).toHaveLength(0);
      expect(await getInvitation(db, token, NOW)).toMatchObject({ status: "valid" });
    });

    it("se o profissional foi ligado a outro nesse meio tempo, falha sem criar vínculo", async () => {
      const pro = await seedProfessional(db, tenantId, "Bia");
      const { token } = await invite("staff", "bia@x.com", pro.id);
      await db.update(professionals).set({ userId: owner.userId }).where(eq(professionals.id, pro.id));
      const e = await failureOf(acceptInvitation(db, token, { name: "Bia", password: PASSWORD }, NOW));
      expect(e.code).toBe("invalid_invitation");
      expect(await db.select().from(users).where(eq(users.email, "bia@x.com"))).toHaveLength(0);
      expect(await getInvitation(db, token, NOW)).toMatchObject({ status: "valid" });
    });

    it("profissional desativado antes do aceite: invalid_invitation", async () => {
      const pro = await seedProfessional(db, tenantId, "Bia");
      const { token } = await invite("staff", "bia@x.com", pro.id);
      await db.update(professionals).set({ active: false }).where(eq(professionals.id, pro.id));
      expect(
        (await failureOf(acceptInvitation(db, token, { name: "Bia", password: PASSWORD }, NOW))).code,
      ).toBe("invalid_invitation");
    });
  });

  describe("usuário já logado (userId)", () => {
    it("aceita quando o e-mail da sessão é o do convite (conta sem vínculo, ex.: removida antes)", async () => {
      const { token } = await invite();
      const user = await plainUser("rita@x.com", { verified: true });
      const result = await acceptInvitation(db, token, { userId: user.id }, NOW);
      expect(result).toEqual({ userId: user.id, tenantId });
      expect(await membershipsOf(db, user.id)).toEqual([
        { userId: user.id, tenantId, role: "reception" },
      ]);
    });

    it("e-mail da sessão diferente: 'Entre com {e-mail} para aceitar.'", async () => {
      const { token } = await invite();
      const other = await plainUser("outra@x.com", { verified: true });
      const e = await failureOf(acceptInvitation(db, token, { userId: other.id }, NOW));
      expect(e.code).toBe("wrong_account");
      expect(e.message).toBe("Entre com rita@x.com para aceitar.");
      expect(await membershipsOf(db, other.id)).toHaveLength(0);
    });

    it("usuário inexistente na sessão é wrong_account", async () => {
      const { token } = await invite();
      const e = await failureOf(
        acceptInvitation(db, token, { userId: "00000000-0000-0000-0000-000000000000" }, NOW),
      );
      expect(e.code).toBe("wrong_account");
    });

    it("conta com vínculo em outro estabelecimento: other_tenant", async () => {
      // Simula a corrida: o convite é criado quando o e-mail ainda não tinha vínculo
      // em lugar nenhum, e a pessoa entra em outro estabelecimento antes de aceitar.
      // Por isso o aceite precisa conferir os vínculos de novo (não só o convite).
      const other = await seedOwnerTenant(db, "Outro", "rita@x.com");
      const { token } = await invite("reception", "rita2@x.com");
      await db.update(users).set({ email: "rita2@x.com" }).where(eq(users.id, other.userId));
      const e = await failureOf(acceptInvitation(db, token, { userId: other.userId }, NOW));
      expect(e.code).toBe("other_tenant");
      expect(e.message).toBe("Esse e-mail já está ligado a outro estabelecimento.");
    });

    it("conta não verificada com senha: o aceite confirma o e-mail e descarta a senha e as sessões (anti pré-sequestro)", async () => {
      const user = await plainUser("rita@x.com", { verified: false, password: "senha-do-atacante-1" });
      await createSession(db, user.id, null);
      const { token } = await invite();
      await acceptInvitation(db, token, { userId: user.id }, NOW);
      const [row] = await db.select().from(users).where(eq(users.id, user.id));
      expect(row.passwordHash).toBeNull();
      expect(row.emailVerifiedAt?.getTime()).toBe(NOW.getTime());
      expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
      expect(await login(db, "rita@x.com", "senha-do-atacante-1")).toBeNull();
    });

    it("removido e convidado de novo volta ao estabelecimento", async () => {
      const first = await invite();
      const { userId } = await acceptInvitation(db, first.token, { name: "Rita", password: PASSWORD }, NOW);
      await removeMember(db, owner, userId);
      const again = await invite();
      const result = await acceptInvitation(db, again.token, { userId }, NOW);
      expect(result.userId).toBe(userId);
      expect(await membershipsOf(db, userId)).toHaveLength(1);
    });
  });

  describe("convite de proprietário", () => {
    it("define a senha, confirma o e-mail, derruba sessões e não cria segundo vínculo", async () => {
      await db.update(users).set({ emailVerifiedAt: null, passwordHash: null }).where(eq(users.id, owner.userId));
      await createSession(db, owner.userId, tenantId);
      const admin = (await seedOwnerTenant(db, "Plataforma", "admin@eneven.com")).userId;
      const { token } = await createOwnerAccessInvite(db, tenantId, admin, NOW);

      expect(await getInvitation(db, token, NOW)).toMatchObject({
        status: "valid",
        role: "owner",
        email: "dona@studio.com",
        hasAccount: true,
      });
      // o convite de proprietário só pede a senha
      const result = await acceptInvitation(db, token, { password: PASSWORD }, NOW);
      expect(result).toEqual({ userId: owner.userId, tenantId });

      const [row] = await db.select().from(users).where(eq(users.id, owner.userId));
      expect(row.emailVerifiedAt?.getTime()).toBe(NOW.getTime());
      expect(await login(db, "dona@studio.com", PASSWORD)).toEqual({ userId: owner.userId });
      expect(await db.select().from(sessions).where(eq(sessions.userId, owner.userId))).toHaveLength(0);
      expect(await membershipsOf(db, owner.userId)).toEqual([
        { userId: owner.userId, tenantId, role: "owner" },
      ]);
      expect(
        (await failureOf(acceptInvitation(db, token, { password: PASSWORD }, NOW))).code,
      ).toBe("invalid_invitation");
    });

    it("convite de equipe continua exigindo o nome", async () => {
      const { token } = await invite();
      const e = await failureOf(acceptInvitation(db, token, { password: PASSWORD }, NOW));
      expect(e.code).toBe("validation");
      expect(e.fieldErrors?.name).toBeTruthy();
    });

    it("convite de proprietário valida a senha", async () => {
      const admin = (await seedOwnerTenant(db, "Plataforma", "admin@eneven.com")).userId;
      const { token } = await createOwnerAccessInvite(db, tenantId, admin, NOW);
      const e = await failureOf(acceptInvitation(db, token, { password: "curta" }, NOW));
      expect(e.fieldErrors?.password).toBeTruthy();
      expect(await getInvitation(db, token, NOW)).toMatchObject({ status: "valid" });
    });

    it("com userId de outra pessoa: wrong_account", async () => {
      const admin = await seedOwnerTenant(db, "Plataforma", "admin@eneven.com");
      const { token } = await createOwnerAccessInvite(db, tenantId, admin.userId, NOW);
      const e = await failureOf(acceptInvitation(db, token, { userId: admin.userId }, NOW));
      expect(e.code).toBe("wrong_account");
      expect(await membershipsOf(db, admin.userId)).toHaveLength(1);
    });

    it("com o userId do próprio dono: marca aceito sem tocar na senha", async () => {
      const admin = await seedOwnerTenant(db, "Plataforma", "admin@eneven.com");
      const { token, invitationId } = await createOwnerAccessInvite(db, tenantId, admin.userId, NOW);
      await acceptInvitation(db, token, { userId: owner.userId }, NOW);
      expect(await login(db, "dona@studio.com", "senha-forte-1")).toEqual({ userId: owner.userId });
      const [inv] = await withTenant(db, tenantId, (tx) =>
        tx.select().from(invitations).where(eq(invitations.id, invitationId)),
      );
      expect(inv.acceptedAt?.getTime()).toBe(NOW.getTime());
    });
  });

  describe("Google", () => {
    it("usuário novo: criado verificado, sem senha, com vínculo Google e membership", async () => {
      const { token } = await invite();
      const { userId } = await acceptInvitation(db, token, { googleProfile: google() }, NOW);
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      expect(user).toMatchObject({ email: "rita@x.com", name: "Rita G", passwordHash: null });
      expect(user.emailVerifiedAt?.getTime()).toBe(NOW.getTime());
      const links = await db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, userId));
      expect(links).toMatchObject([{ provider: "google", providerUserId: "google-sub-1" }]);
      expect(await membershipsOf(db, userId)).toEqual([{ userId, tenantId, role: "reception" }]);
    });

    it("e-mail do Google diferente do convite: wrong_account, nada é criado", async () => {
      const { token } = await invite();
      const e = await failureOf(
        acceptInvitation(db, token, { googleProfile: google({ email: "outra@x.com" }) }, NOW),
      );
      expect(e.code).toBe("wrong_account");
      expect(await db.select().from(oauthAccounts)).toHaveLength(0);
      expect(await db.select().from(users).where(eq(users.email, "outra@x.com"))).toHaveLength(0);
    });

    it("compara o e-mail sem diferenciar maiúsculas", async () => {
      const { token } = await invite();
      await acceptInvitation(db, token, { googleProfile: google({ email: "Rita@X.com" }) }, NOW);
    });

    it("e-mail não verificado no Google: recusa", async () => {
      const { token } = await invite();
      const e = await failureOf(
        acceptInvitation(db, token, { googleProfile: google({ emailVerified: false }) }, NOW),
      );
      expect(e.code).toBe("google_failed");
      expect(await db.select().from(oauthAccounts)).toHaveLength(0);
    });

    it("conta existente verificada: vincula o Google e mantém a senha", async () => {
      const user = await plainUser("rita@x.com", { verified: true, password: "senha-original-1" });
      const { token } = await invite();
      const result = await acceptInvitation(db, token, { googleProfile: google() }, NOW);
      expect(result.userId).toBe(user.id);
      expect(await login(db, "rita@x.com", "senha-original-1")).toEqual({ userId: user.id });
    });

    it("conta existente NÃO verificada com senha: descarta a senha e as sessões (como resolveGoogleUser)", async () => {
      const user = await plainUser("rita@x.com", { verified: false, password: "senha-do-atacante-1" });
      await createSession(db, user.id, null);
      const { token } = await invite();
      await acceptInvitation(db, token, { googleProfile: google() }, NOW);
      expect(await login(db, "rita@x.com", "senha-do-atacante-1")).toBeNull();
      expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
      const [row] = await db.select().from(users).where(eq(users.id, user.id));
      expect(row.emailVerifiedAt).not.toBeNull();
    });

    it("conta Google já ligada a outro e-mail: wrong_account", async () => {
      const other = await plainUser("outra@x.com", { verified: true });
      await db
        .insert(oauthAccounts)
        .values({ provider: "google", providerUserId: "google-sub-1", userId: other.id, email: "outra@x.com" });
      const { token } = await invite();
      const e = await failureOf(acceptInvitation(db, token, { googleProfile: google() }, NOW));
      expect(e.code).toBe("wrong_account");
      expect(await membershipsOf(db, other.id)).toHaveLength(0);
    });

    it("convite de proprietário com Google do dono vincula e aceita", async () => {
      const admin = await seedOwnerTenant(db, "Plataforma", "admin@eneven.com");
      const { token } = await createOwnerAccessInvite(db, tenantId, admin.userId, NOW);
      const result = await acceptInvitation(
        db,
        token,
        { googleProfile: google({ email: "dona@studio.com", sub: "dona-sub" }) },
        NOW,
      );
      expect(result.userId).toBe(owner.userId);
      expect(
        await db
          .select()
          .from(oauthAccounts)
          .where(and(eq(oauthAccounts.userId, owner.userId), eq(oauthAccounts.providerUserId, "dona-sub"))),
      ).toHaveLength(1);
      expect(await membershipsOf(db, owner.userId)).toHaveLength(1);
    });
  });

  it("tokens de um estabelecimento não dão vínculo em outro", async () => {
    const other = await seedOwnerTenant(db, "Outro", "outra@outro.com");
    const { token } = await invite();
    const { userId, tenantId: tid } = await acceptInvitation(db, token, { name: "R", password: PASSWORD }, NOW);
    expect(tid).toBe(tenantId);
    const rows = await membershipsOf(db, userId);
    expect(rows.map((r) => r.tenantId)).toEqual([tenantId]);
    expect(rows.map((r) => r.tenantId)).not.toContain(other.tenantId);
  });
});
