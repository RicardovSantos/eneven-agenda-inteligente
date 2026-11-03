import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, invitations, plans, sessions, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { createSession, getSession, hashToken } from "@/server/auth/session";
import { createTestDb } from "../helpers/test-db";
import { planId, seedPlatformTenant, seedSuperAdmin } from "../helpers/platform-fixtures";
import { seedOwnerTenant } from "../helpers/team-fixtures";

const state = vi.hoisted(() => ({ db: undefined as unknown, token: undefined as string | undefined }));

vi.mock("@/db/client", () => ({ getDb: async () => state.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "ea_session" && state.token ? { value: state.token } : undefined),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/email/send", () => ({ sendEmail: vi.fn(async () => {}) }));

let db: Db;
beforeEach(async () => {
  vi.resetModules();
  db = await createTestDb();
  state.db = db;
  state.token = undefined;
});

const actions = () => import("@/app/admin/actions");
const redirectOf = async (promise: Promise<unknown>) =>
  (await promise.then(
    () => null,
    (e: unknown) => (e as Error).message,
  )) ?? null;
const statusOf = async (id: string) =>
  (await db.select().from(tenants).where(eq(tenants.id, id)))[0].status;

async function asAdmin() {
  const admin = await seedSuperAdmin(db);
  state.token = await createSession(db, admin.id, null);
  return admin;
}

describe("ações de /admin: quem não é super-admin", () => {
  it("proprietário comum é mandado para /entrar e nada muda", async () => {
    const a = await actions();
    const owner = await seedOwnerTenant(db, "Salão", "dona@exemplo.com");
    const other = await seedPlatformTenant(db);
    state.token = await createSession(db, owner.userId, owner.tenantId);

    expect(await redirectOf(a.blockTenantAction(other.tenant.id))).toBe("NEXT_REDIRECT:/entrar");
    expect(await redirectOf(a.cancelTenantAction(other.tenant.id))).toBe("NEXT_REDIRECT:/entrar");
    expect(await redirectOf(a.activateTenantAction(other.tenant.id))).toBe("NEXT_REDIRECT:/entrar");
    expect(await redirectOf(a.extendTrialAction(other.tenant.id, 7))).toBe("NEXT_REDIRECT:/entrar");
    expect(await redirectOf(a.enterSupportAction(other.tenant.id))).toBe("NEXT_REDIRECT:/entrar");
    expect(await redirectOf(a.changePlanAction(other.tenant.id, await planId(db, "studio")))).toBe(
      "NEXT_REDIRECT:/entrar",
    );
    expect(await redirectOf(a.sendOwnerInviteAction(other.tenant.id))).toBe("NEXT_REDIRECT:/entrar");
    expect(await redirectOf(a.leaveSupportAction())).toBe("NEXT_REDIRECT:/entrar");
    expect(await redirectOf(a.updatePlanAction(await planId(db, "essencial"), {}))).toBe(
      "NEXT_REDIRECT:/entrar",
    );
    expect(await statusOf(other.tenant.id)).toBe("trial");
    expect(await db.select().from(auditLog)).toHaveLength(0);
    // e a sessão dele não virou sessão de suporte
    expect((await getSession(db, state.token))?.support).toBe(false);
  });

  it("sem sessão também vai para /entrar", async () => {
    const a = await actions();
    const other = await seedPlatformTenant(db);
    expect(await redirectOf(a.blockTenantAction(other.tenant.id))).toBe("NEXT_REDIRECT:/entrar");
    expect(await redirectOf(a.createTenantAction({}))).toBe("NEXT_REDIRECT:/entrar");
  });
});

describe("ações de /admin: super-admin", () => {
  it("bloqueia, ativa e cancela, com a mensagem e a auditoria do ator", async () => {
    const admin = await asAdmin();
    const a = await actions();
    const { tenant } = await seedPlatformTenant(db);

    expect(await a.blockTenantAction(tenant.id)).toEqual({ ok: true, message: "Estabelecimento bloqueado" });
    expect(await statusOf(tenant.id)).toBe("read_only");
    expect(await a.activateTenantAction(tenant.id)).toEqual({ ok: true, message: "Assinatura ativada" });
    expect(await statusOf(tenant.id)).toBe("active");
    expect(await a.cancelTenantAction(tenant.id)).toEqual({ ok: true, message: "Conta cancelada" });
    expect(await statusOf(tenant.id)).toBe("canceled");

    const rows = await db.select().from(auditLog).where(eq(auditLog.tenantId, tenant.id));
    expect(rows.map((r) => r.action).sort()).toEqual([
      "tenant.activated",
      "tenant.blocked",
      "tenant.canceled",
    ]);
    expect(rows.every((r) => r.actorUserId === admin.id)).toBe(true);
  });

  it("estende o teste e troca o plano", async () => {
    await asAdmin();
    const a = await actions();
    const { tenant } = await seedPlatformTenant(db);

    expect(await a.extendTrialAction(tenant.id, 7)).toEqual({
      ok: true,
      message: "Teste estendido em 7 dias",
    });
    const [after] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
    expect(after.trialEndsAt.getTime()).toBeGreaterThan(tenant.trialEndsAt.getTime());

    expect(await a.extendTrialAction(tenant.id, 5 as 7)).toMatchObject({ ok: false });

    const pro = await planId(db, "profissional");
    expect(await a.changePlanAction(tenant.id, pro)).toEqual({ ok: true, message: "Plano alterado" });
    expect((await db.select().from(tenants).where(eq(tenants.id, tenant.id)))[0].planId).toBe(pro);
  });

  it("erro de domínio volta como { ok: false, error }", async () => {
    await asAdmin();
    const a = await actions();
    expect(await a.blockTenantAction("00000000-0000-4000-8000-000000000000")).toEqual({
      ok: false,
      error: "Estabelecimento não encontrado.",
    });
    expect(await a.blockTenantAction("não-é-uuid")).toMatchObject({ ok: false });
  });

  it("cria o estabelecimento e devolve o id", async () => {
    await asAdmin();
    const a = await actions();
    const result = await a.createTenantAction({
      businessName: "Studio Novo",
      ownerName: "Marina",
      ownerEmail: "marina@studionovo.com",
      whatsapp: "(11) 99654-2210",
      planId: await planId(db, "profissional"),
      trialDays: 14,
    });
    expect(result).toMatchObject({ ok: true, message: "Estabelecimento criado" });
    const created = result as { ok: true; tenantId: string };
    expect((await db.select().from(tenants).where(eq(tenants.id, created.tenantId)))[0].name).toBe(
      "Studio Novo",
    );
  });

  it("criação com erro devolve a mensagem e os erros por campo", async () => {
    await asAdmin();
    const a = await actions();
    const result = await a.createTenantAction({
      businessName: "",
      ownerName: "Marina",
      ownerEmail: "x",
      whatsapp: "1",
      planId: await planId(db, "essencial"),
      trialDays: 14,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { fieldErrors?: Record<string, string> }).fieldErrors).toMatchObject({
      businessName: expect.any(String),
      ownerEmail: expect.any(String),
    });
  });

  it("edita um plano", async () => {
    await asAdmin();
    const a = await actions();
    const id = await planId(db, "essencial");
    const result = await a.updatePlanAction(id, {
      name: "Essencial",
      priceCents: 2990,
      maxProfessionals: null,
      monthlyMessages: 100,
      active: true,
    });
    expect(result).toEqual({ ok: true, message: "Plano salvo" });
    expect((await db.select().from(plans).where(eq(plans.id, id)))[0]).toMatchObject({
      priceCents: 2990,
      maxProfessionals: null,
      monthlyMessages: 100,
    });
    expect(await a.updatePlanAction(id, { name: "" })).toMatchObject({ ok: false });
  });

  it("envia o acesso por e-mail ao dono e revoga o convite anterior", async () => {
    const admin = await asAdmin();
    const a = await actions();
    const { tenant } = await seedPlatformTenant(db);
    expect(await a.sendOwnerInviteAction(tenant.id)).toEqual({
      ok: true,
      message: "Acesso enviado por e-mail",
    });
    expect(await a.sendOwnerInviteAction(tenant.id)).toMatchObject({ ok: true });
    const rows = await db.select().from(invitations).where(eq(invitations.tenantId, tenant.id));
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.revokedAt === null)).toHaveLength(1);
    const audits = await db.select().from(auditLog).where(eq(auditLog.tenantId, tenant.id));
    const sent = audits.filter((r) => r.action === "tenant.owner_invite_sent");
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ actorUserId: admin.id, details: { emailSent: true } });
  });

  it("enviar acesso com id malformado ou inexistente devolve 'não encontrado', sem auditar", async () => {
    await asAdmin();
    const a = await actions();
    const notFound = { ok: false, error: "Estabelecimento não encontrado." };
    expect(await a.sendOwnerInviteAction("não-é-uuid")).toEqual(notFound);
    expect(await a.sendOwnerInviteAction("00000000-0000-4000-8000-000000000000")).toEqual(notFound);
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it("'Entrar como' inicia o suporte na própria sessão e vai para /painel; 'Voltar' volta ao detalhe", async () => {
    const admin = await asAdmin();
    const a = await actions();
    const { tenant } = await seedPlatformTenant(db);

    expect(await redirectOf(a.enterSupportAction(tenant.id))).toBe("NEXT_REDIRECT:/painel");
    expect(await getSession(db, state.token!)).toMatchObject({
      userId: admin.id,
      tenantId: tenant.id,
      role: "owner",
      support: true,
    });

    expect(await redirectOf(a.leaveSupportAction())).toBe(
      `NEXT_REDIRECT:/admin/estabelecimentos/${tenant.id}`,
    );
    expect(await getSession(db, state.token!)).toMatchObject({ support: false, tenantId: null });
    const [row] = await db.select().from(sessions).where(eq(sessions.id, hashToken(state.token!)));
    expect(row.supportStartedAt).toBeNull();
  });

  it("'Voltar' numa tela velha, com o suporte já encerrado, segue para a plataforma sem erro", async () => {
    await asAdmin();
    const a = await actions();
    const { tenant } = await seedPlatformTenant(db);

    expect(await redirectOf(a.enterSupportAction(tenant.id))).toBe("NEXT_REDIRECT:/painel");
    expect(await redirectOf(a.leaveSupportAction())).toBe(`NEXT_REDIRECT:/admin/estabelecimentos/${tenant.id}`);
    // A segunda aba ainda mostra a faixa e toca em "Voltar" de novo.
    expect(await redirectOf(a.leaveSupportAction())).toBe("NEXT_REDIRECT:/admin");
  });

  it("'Entrar como' num estabelecimento que não existe devolve o erro, sem redirecionar", async () => {
    await asAdmin();
    const a = await actions();
    expect(await a.enterSupportAction("00000000-0000-4000-8000-000000000000")).toEqual({
      ok: false,
      error: "Estabelecimento não encontrado.",
    });
  });
});
