import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/cron/whatsapp/route";

afterEach(() => vi.unstubAllEnvs());
describe("autorização do cron", () => {
  it("fica desligado sem segredo", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await POST(new Request("http://localhost/api/cron/whatsapp", { method: "POST" }))).status).toBe(503);
  });
  it("recusa segredo incorreto antes de acessar o banco", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-de-teste");
    expect((await POST(new Request("http://localhost/api/cron/whatsapp", { method: "POST", headers: { authorization: "Bearer errado" } }))).status).toBe(401);
  });
});
