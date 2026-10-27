import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invitations, memberships, professionals, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { sendEmail } from "@/server/email/send";
import { resetRateLimitsForTests } from "@/server/security/limits";
import { listTeamAccess } from "@/server/team/members";
import { createTestDb } from "../helpers/test-db";
import { seedOwnerTenant } from "../helpers/team-fixtures";

const state = vi.hoisted(() => ({ db: undefined as unknown, session: undefined as unknown }));

vi.mock("@/db/client", () => ({ getDb: async () => state.db }));
vi.mock("@/server/auth/guard", () => ({ requireTenantSession: async () => state.session }));
vi.mock("@/server/email/send", () => ({ sendEmail: vi.fn(async () => {}) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import {
  inviteMemberAction,
  removeMemberAction,
  resendInvitationAction,
  revokeInvitationAction,
} from "@/app/painel/configuracoes/actions";

const sendEmailMock = vi.mocked(sendEmail);
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const FORBIDDEN = "Você não tem permissão para fazer isso.";
const SOME_ID = "00000000-0000-4000-8000-000000000000";

let db: Db;
let tenantId: string;
let ownerId: string;
let proId: string;

const asRole = (role: "owner" | "reception" | "staff") => {
  state.session = { userId: ownerId, tenantId, role, isSuperAdmin: false, emailVerified: true };
};

beforeEach(async () => {
  resetRateLimitsForTests();
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue(undefined);
  db = await createTestDb();
  state.db = db;
  const owner = await seedOwnerTenant(db, "Studio Defendi", "dona@defendi.com");
  tenantId = owner.tenantId;
  ownerId = owner.userId;
  const [pro] = await db
    .insert(professionals)
    .values({ tenantId, name: "Bia", color: "#B4237A", active: true })
    .returning({ id: professionals.id });
  proId = pro.id;
  asRole("owner");
});

describe("ações de acessos da equipe: papel", () => {
  it.each(["reception", "staff"] as const)(
    "%s não convida, reenvia, cancela nem remove",
    async (role) => {
      asRole(role);
      const invite = await inviteMemberAction(
        {},
        form({ name: "Rita", email: "rita@x.com", role: "reception" }),
      );
      expect(invite.error).toBe(FORBIDDEN);
      expect(invite.ok).toBeFalsy();
      expect((await resendInvitationAction(SOME_ID)).error).toBe(FORBIDDEN);
      expect((await revokeInvitationAction(SOME_ID)).error).toBe(FORBIDDEN);
      expect((await removeMemberAction(ownerId)).error).toBe(FORBIDDEN);
      expect(await db.select().from(invitations)).toHaveLength(0);
      expect(sendEmailMock).not.toHaveBeenCalled();
    },
  );
});

describe("ações de acessos da equipe: proprietário", () => {
  it("convida a recepção: lista o convite, manda o e-mail e NÃO devolve o token", async () => {
    const result = await inviteMemberAction(
      {},
      form({ name: "Rita", email: "Rita@X.com", role: "reception" }),
    );
    expect(result.ok).toBe(true);
    expect(result.message).toBe("Convite enviado");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    const mail = sendEmailMock.mock.calls[0][0];
    const token = /\/convite\/([A-Za-z0-9_-]{43})/.exec(`${mail.html}${mail.text ?? ""}`)?.[1];
    expect(token).toBeDefined();
    // O token só vai por e-mail: nada do resultado o contém.
    expect(JSON.stringify(result)).not.toContain(token as string);
    expect(JSON.stringify(result)).not.toMatch(/\/convite\//);

    const rows = await listTeamAccess(db, tenantId);
    expect(rows.find((r) => r.kind === "invite")).toMatchObject({
      email: "rita@x.com",
      role: "reception",
    });
  });

  it("convida um profissional ligado a um profissional da equipe", async () => {
    const result = await inviteMemberAction(
      {},
      form({ name: "Bia", email: "bia@x.com", role: "staff", professionalId: proId }),
    );
    expect(result.ok).toBe(true);
    const [row] = await db.select().from(invitations).where(eq(invitations.email, "bia@x.com"));
    expect(row).toMatchObject({ role: "staff", professionalId: proId });
  });

  it("dados inválidos voltam como erro por campo", async () => {
    const result = await inviteMemberAction({}, form({ name: "", email: "xx", role: "staff" }));
    expect(result.ok).toBeFalsy();
    expect(result.fieldErrors).toMatchObject({
      name: "Informe o nome.",
      email: "Informe um e-mail válido.",
    });
  });

  it("profissional sem escolher quem da equipe: erro no campo do profissional", async () => {
    const result = await inviteMemberAction(
      {},
      form({ name: "Bia", email: "bia@x.com", role: "staff", professionalId: "" }),
    );
    expect(result.ok).toBeFalsy();
    expect(result.fieldErrors?.professionalId).toBeDefined();
  });

  it("e-mail que já tem acesso: erro claro", async () => {
    const result = await inviteMemberAction(
      {},
      form({ name: "Dona", email: "dona@defendi.com", role: "reception" }),
    );
    expect(result.ok).toBeFalsy();
    expect(result.error).toBe("Essa pessoa já tem acesso.");
  });

  it("e-mail não enviado: o convite existe e o aviso manda usar Reenviar convite", async () => {
    sendEmailMock.mockRejectedValue(new Error("provedor fora do ar"));
    const result = await inviteMemberAction(
      {},
      form({ name: "Rita", email: "rita@x.com", role: "reception" }),
    );
    expect(result.ok).toBe(true);
    expect(result.emailSent).toBe(false);
    expect(result.message).toBe(
      "Convite criado, mas o e-mail não foi enviado. Use “Reenviar convite”.",
    );
    expect((await listTeamAccess(db, tenantId)).some((r) => r.kind === "invite")).toBe(true);
  });

  it("reenvia, cancela o convite e remove o acesso de um membro", async () => {
    await inviteMemberAction({}, form({ name: "Rita", email: "rita@x.com", role: "reception" }));
    const [invite] = await db.select().from(invitations);

    sendEmailMock.mockClear();
    const resent = await resendInvitationAction(invite.id);
    expect(resent).toMatchObject({ ok: true, message: "Convite reenviado" });
    expect(JSON.stringify(resent)).not.toMatch(/\/convite\//);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    expect(await revokeInvitationAction(invite.id)).toMatchObject({
      ok: true,
      message: "Convite cancelado",
    });
    expect((await listTeamAccess(db, tenantId)).some((r) => r.kind === "invite")).toBe(false);

    const [rita] = await db
      .insert(users)
      .values({ email: "rita2@x.com", name: "Rita", passwordHash: null, emailVerifiedAt: new Date() })
      .returning({ id: users.id });
    await db.insert(memberships).values({ userId: rita.id, tenantId, role: "reception" });
    expect(await removeMemberAction(rita.id)).toMatchObject({
      ok: true,
      message: "Acesso removido",
    });
    expect(await db.select().from(memberships).where(eq(memberships.userId, rita.id))).toHaveLength(0);
  });

  it("não remove o proprietário", async () => {
    const result = await removeMemberAction(ownerId);
    expect(result.ok).toBe(false);
    expect(await db.select().from(memberships).where(eq(memberships.userId, ownerId))).toHaveLength(1);
  });
});
