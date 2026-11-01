import { describe, expect, it, vi } from "vitest";
import { assertSandboxAccount, isSandboxAccessToken } from "@/server/billing/sandbox";
import { testBillingConfig } from "@/server/billing/test-config";

const account = (body: unknown, ok = true) => vi.fn(async () => Response.json(body, { status: ok ? 200 : 401 })) as unknown as typeof fetch;

describe("isSandboxAccessToken", () => {
  it("token TEST- sempre é teste (mas nunca em produção, onde a rota o recusa)", () => {
    expect(isSandboxAccessToken("TEST-abc", {})).toBe(true);
    expect(isSandboxAccessToken(undefined, {})).toBe(false);
    expect(isSandboxAccessToken("", {})).toBe(false);
  });

  it("APP_USR- só vale com MERCADO_PAGO_SANDBOX=true e fora de produção", () => {
    expect(isSandboxAccessToken("APP_USR-1-2-3-4", {})).toBe(false);
    expect(isSandboxAccessToken("APP_USR-1-2-3-4", { MERCADO_PAGO_SANDBOX: "true" })).toBe(true);
    expect(isSandboxAccessToken("APP_USR-1-2-3-4", { MERCADO_PAGO_SANDBOX: "true", NODE_ENV: "production" })).toBe(false);
    expect(isSandboxAccessToken("APP_USR-1-2-3-4", { MERCADO_PAGO_SANDBOX: "false" })).toBe(false);
    expect(isSandboxAccessToken("qualquer-coisa", { MERCADO_PAGO_SANDBOX: "true" })).toBe(false);
  });
});

describe("assertSandboxAccount", () => {
  it("aceita conta de teste que é o vendedor configurado", async () => {
    await expect(assertSandboxAccount("APP_USR-x", "42", account({ id: 42, nickname: "TESTUSER123" }))).resolves.toBeUndefined();
  });

  it("recusa conta real, vendedor diferente e falha de rede", async () => {
    await expect(assertSandboxAccount("APP_USR-x", "42", account({ id: 42, nickname: "LOJADORICARDO" }))).rejects.toThrow(/não é de uma conta de teste/);
    await expect(assertSandboxAccount("APP_USR-x", "42", account({ id: 7, nickname: "TESTUSER1" }))).rejects.toThrow(/não é de uma conta de teste/);
    await expect(assertSandboxAccount("APP_USR-x", "42", account({}, false))).rejects.toThrow(/confirmar a conta/);
    await expect(assertSandboxAccount("APP_USR-x", "42", vi.fn(async () => { throw new Error("rede"); }) as unknown as typeof fetch)).rejects.toThrow(/confirmar a conta/);
  });

  it("token TEST- nem consulta a Mercado Pago", async () => {
    const fetcher = account({});
    await assertSandboxAccount("TEST-x", "42", fetcher);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("testBillingConfig com token APP_USR-", () => {
  it("só configura com a liberação explícita do sandbox", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("MERCADO_PAGO_ACCESS_TOKEN", "APP_USR-1-2-3-4");
    vi.stubEnv("MERCADO_PAGO_COLLECTOR_ID", "4");
    vi.stubEnv("MERCADO_PAGO_LIVE_MODE", "false");
    vi.stubEnv("APP_URL", "https://agenda.exemplo.com");
    vi.stubEnv("MERCADO_PAGO_SANDBOX", "");
    expect(testBillingConfig()).toBeNull();
    vi.stubEnv("MERCADO_PAGO_SANDBOX", "true");
    expect(testBillingConfig()).toMatchObject({ collectorId: "4" });
    vi.unstubAllEnvs();
  });
});
