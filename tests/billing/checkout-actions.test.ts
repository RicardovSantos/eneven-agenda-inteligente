import { afterEach, expect, it, vi } from "vitest";
import { users } from "@/db/schema";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

const state = vi.hoisted(() => ({ db: undefined as unknown, session: undefined as unknown, create: vi.fn(async () => ({ checkoutUrl: "https://sandbox.mercadopago.com.br/checkout" })) }));
vi.mock("@/db/client", () => ({ getDb: async () => state.db }));
vi.mock("@/server/auth/guard", () => ({ requireTenantSession: async () => state.session }));
vi.mock("@/server/billing/create-subscription", () => ({ createSubscription: state.create }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
import { startCheckout } from "@/app/painel/configuracoes/assinatura/actions";

afterEach(() => { vi.unstubAllEnvs(); state.create.mockClear(); });

it("aceita somente o dono verificado, plano atual e configuração de teste", async () => {
  const db = await createTestDb(); state.db = db;
  const tenant = await seedTenant(db);
  const [user] = await db.insert(users).values({ name: "Dona", email: "dona@example.com", emailVerifiedAt: new Date() }).returning();
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("MERCADO_PAGO_ACCESS_TOKEN", "TEST-example"); vi.stubEnv("MERCADO_PAGO_COLLECTOR_ID", "42"); vi.stubEnv("MERCADO_PAGO_LIVE_MODE", "false"); vi.stubEnv("APP_URL", "https://agenda.example");
  const form = new FormData(); form.set("planId", tenant.planId); form.set("tenantId", "outra-conta"); form.set("payerEmail", "outro@example.com");
  state.session = { userId: user.id, tenantId: tenant.id, role: "staff", support: false };
  await expect(startCheckout(form)).rejects.toThrow();
  state.session = { userId: user.id, tenantId: tenant.id, role: "owner", support: true };
  await expect(startCheckout(form)).rejects.toThrow("suporte");
  state.session = { userId: user.id, tenantId: tenant.id, role: "owner", support: false };
  form.set("planId", "outro-plano");
  await expect(startCheckout(form)).rejects.toThrow("indisponível");
  expect(state.create).not.toHaveBeenCalled();
  form.set("planId", tenant.planId);
  await expect(startCheckout(form)).rejects.toThrow("redirect:https://sandbox.mercadopago.com.br/checkout");
  expect(state.create).toHaveBeenCalledWith(db, expect.objectContaining({ tenantId: tenant.id, planId: tenant.planId, ownerUserId: user.id, payerEmail: "outro@example.com", backUrl: "https://agenda.example/painel/configuracoes/assinatura" }), expect.any(Object));
  // Em branco: usa o e-mail do login do dono (nunca um valor vindo de outro lugar).
  state.create.mockClear();
  form.set("payerEmail", "   ");
  await expect(startCheckout(form)).rejects.toThrow("redirect:");
  expect(state.create).toHaveBeenCalledWith(db, expect.objectContaining({ payerEmail: "dona@example.com" }), expect.any(Object));
  // Inválido: recusa antes de falar com o Mercado Pago.
  state.create.mockClear();
  form.set("payerEmail", "isso-nao-e-email");
  await expect(startCheckout(form)).rejects.toThrow("inválido");
  expect(state.create).not.toHaveBeenCalled();
  vi.stubEnv("NODE_ENV", "production");
  form.set("payerEmail", "outro@example.com");
  await expect(startCheckout(form)).rejects.toThrow("não configurada");
});
