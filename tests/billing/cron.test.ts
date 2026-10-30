import { afterEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/cron/cobranca/route";

const request = (token?: string) => new Request("http://localhost/api/cron/cobranca", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} });
afterEach(() => vi.unstubAllEnvs());

it("recusa cron em produção e sem autorização ou configuração", async () => {
  vi.stubEnv("NODE_ENV", "production");
  expect((await POST(request("secret"))).status).toBe(503);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("CRON_SECRET", "secret");
  expect((await POST(request("wrong"))).status).toBe(401);
  vi.stubEnv("MERCADO_PAGO_ACCESS_TOKEN", "");
  expect((await POST(request("secret"))).status).toBe(503);
});
