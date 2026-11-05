import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auditLog, paymentGatewaySettings } from "@/db/schema";
import type { Db } from "@/db/types";
import { gatewayReadiness } from "@/server/billing/gateways/readiness";
import { getGatewaySettings, resolveGateway } from "@/server/billing/gateways/router";
import { GatewayUnavailableError } from "@/server/billing/gateways/types";
import { getPaymentRouting, listGatewayChanges, setPaymentGateway } from "@/server/platform/payment-gateways";
import { createTestDb } from "../../helpers/test-db";
import { seedPlatformTenant } from "../../helpers/platform-fixtures";

const MP: Record<string, string> = { NODE_ENV: "production", MERCADO_PAGO_LIVE_MODE: "true", MERCADO_PAGO_ACCESS_TOKEN: "APP_USR-1", MERCADO_PAGO_COLLECTOR_ID: "42", APP_URL: "https://agenda.example.com" };
const STRIPE_TEST: Record<string, string> = { STRIPE_LIVE_MODE: "true", STRIPE_SECRET_KEY: "sk_live_abc", STRIPE_WEBHOOK_SECRET: "whsec_abc" };

let db: Db;
let actor: { userId: string };
beforeEach(async () => {
  db = await createTestDb();
  const { owner } = await seedPlatformTenant(db);
  actor = { userId: owner.id };
});

describe("roteador de provedores", () => {
  it("tem Mercado Pago como padrão de todas as formas", async () => {
    expect(await getGatewaySettings(db)).toEqual({ card: "mercadopago", pix: "mercadopago", boleto: "mercadopago" });
  });

  it("recusa em vez de trocar de provedor quando o padrão não está configurado", async () => {
    await expect(resolveGateway(db, "card", { NODE_ENV: "production" })).rejects.toBeInstanceOf(GatewayUnavailableError);
  });

  it("devolve o padrão configurado", async () => {
    expect(await resolveGateway(db, "card", MP)).toBe("mercadopago");
  });

  it("a Stripe só faz cartão", () => {
    const env = { NODE_ENV: "production", ...STRIPE_TEST };
    expect(gatewayReadiness("stripe", "pix", env).ready).toBe(false);
    expect(gatewayReadiness("stripe", "boleto", env).ready).toBe(false);
    expect(gatewayReadiness("stripe", "card", env).ready).toBe(true);
  });

  it("em produção o modo real exige chave real", () => {
    expect(gatewayReadiness("stripe", "card", { NODE_ENV: "production", STRIPE_LIVE_MODE: "true", STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_a" }).ready).toBe(false);
  });
  it("fora de produção só a chave de teste vale", () => {
    expect(gatewayReadiness("stripe", "card", { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_a" }).ready).toBe(true);
    expect(gatewayReadiness("stripe", "card", { STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "whsec_a" }).ready).toBe(false);
  });
});

describe("troca do provedor padrão (superadmin)", () => {
  it("lista só provedores capazes em cada forma", async () => {
    const routing = await getPaymentRouting(db, { ...MP, ...STRIPE_TEST });
    const by = Object.fromEntries(routing.map((r) => [r.method, r.options.map((o) => o.gateway)]));
    expect(by).toEqual({ card: ["mercadopago", "stripe"], pix: ["mercadopago"], boleto: ["mercadopago"] });
  });

  it("não deixa escolher a Stripe sem credenciais", async () => {
    await expect(setPaymentGateway(db, actor, { method: "card", provider: "stripe" }, MP)).rejects.toThrow(/não está pronta/);
    expect((await getGatewaySettings(db)).card).toBe("mercadopago");
  });

  it("não deixa escolher a Stripe para Pix ou boleto", async () => {
    await expect(setPaymentGateway(db, actor, { method: "pix", provider: "stripe" }, { ...MP, ...STRIPE_TEST })).rejects.toThrow();
    await expect(setPaymentGateway(db, actor, { method: "boleto", provider: "stripe" }, { ...MP, ...STRIPE_TEST })).rejects.toThrow();
  });

  it("rejeita valores inválidos", async () => {
    await expect(setPaymentGateway(db, actor, { method: "cripto", provider: "stripe" }, { ...MP, ...STRIPE_TEST })).rejects.toThrow();
    await expect(setPaymentGateway(db, actor, { method: "card", provider: "paypal" }, { ...MP, ...STRIPE_TEST })).rejects.toThrow();
  });

  it("troca só o cartão e grava a auditoria", async () => {
    const env = { ...MP, ...STRIPE_TEST };
    expect(await setPaymentGateway(db, actor, { method: "card", provider: "stripe" }, env)).toEqual({ changed: true });
    expect(await getGatewaySettings(db)).toEqual({ card: "stripe", pix: "mercadopago", boleto: "mercadopago" });
    const [row] = await db.select().from(paymentGatewaySettings).where(eq(paymentGatewaySettings.method, "card"));
    expect(row.updatedBy).toBe(actor.userId);
    const audit = await db.select().from(auditLog).where(eq(auditLog.action, "payment_gateway.changed"));
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toEqual({ method: "card", from: "mercadopago", to: "stripe" });
    expect(await listGatewayChanges(db)).toMatchObject([{ method: "card", from: "mercadopago", to: "stripe" }]);
  });

  it("repetir o mesmo valor não muda nem audita", async () => {
    expect(await setPaymentGateway(db, actor, { method: "card", provider: "mercadopago" }, MP)).toEqual({ changed: false });
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "payment_gateway.changed"))).toHaveLength(0);
  });

  it("volta para a Mercado Pago quando quiser", async () => {
    const env = { ...MP, ...STRIPE_TEST };
    await setPaymentGateway(db, actor, { method: "card", provider: "stripe" }, env);
    await setPaymentGateway(db, actor, { method: "card", provider: "mercadopago" }, env);
    expect((await getGatewaySettings(db)).card).toBe("mercadopago");
    expect(await listGatewayChanges(db)).toHaveLength(2);
  });
});
