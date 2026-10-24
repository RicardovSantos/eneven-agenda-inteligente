import { afterEach, describe, expect, it, vi } from "vitest";
import { appUrl, resetLink, verifyLink } from "@/server/email/templates";

afterEach(() => vi.unstubAllEnvs());

describe("appUrl", () => {
  it("usa APP_URL sem a barra final", () => {
    vi.stubEnv("APP_URL", "https://agenda.eneven.com.br/");
    expect(appUrl()).toBe("https://agenda.eneven.com.br");
  });

  it("fora de produção cai em localhost", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_URL", "");
    expect(appUrl()).toBe("http://localhost:3000");
    vi.stubEnv("NODE_ENV", "test");
    expect(appUrl()).toBe("http://localhost:3000");
  });

  it("em produção sem APP_URL (vazio ou só espaços) lança", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "");
    expect(() => appUrl()).toThrow("APP_URL não definido");
    vi.stubEnv("APP_URL", "   ");
    expect(() => appUrl()).toThrow("APP_URL não definido");
  });

  it("em produção com APP_URL funciona", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://agenda.eneven.com.br");
    expect(appUrl()).toBe("https://agenda.eneven.com.br");
  });

  it("durante o `next build` (NEXT_PHASE) não lança: o build local funciona sem APP_URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    expect(appUrl()).toBe("http://localhost:3000");
  });

  it("os links dos e-mails também falham em produção sem APP_URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "");
    expect(() => verifyLink("abc")).toThrow("APP_URL não definido");
    expect(() => resetLink("abc")).toThrow("APP_URL não definido");
  });
});
