import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../next.config";

afterEach(() => vi.unstubAllEnvs());

async function allHeaders() {
  const rules = (await nextConfig.headers?.()) ?? [];
  const rule = rules.find((r) => r.source === "/:path*");
  return Object.fromEntries((rule?.headers ?? []).map((h) => [h.key, h.value]));
}

describe("favicon", () => {
  it("o favicon padrão do Next não existe mais", () => {
    expect(existsSync("src/app/favicon.ico")).toBe(false);
  });

  it("/favicon.ico é servido pelo ícone gerado em /brand", async () => {
    const rewrites = await nextConfig.rewrites?.();
    const list = Array.isArray(rewrites) ? rewrites : (rewrites?.afterFiles ?? []);
    expect(list).toContainEqual({ source: "/favicon.ico", destination: "/brand/favicon.ico" });
  });
});

describe("cabeçalhos de segurança", () => {
  it("não anuncia o Next.js", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("vale para todas as rotas", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    expect(rules.map((r) => r.source)).toContain("/:path*");
  });

  it("páginas de gestão (token na URL): sem referrer e fora dos buscadores", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const rule = rules.find((r) => r.source === "/agendamento/:path*");
    const headers = Object.fromEntries((rule?.headers ?? []).map((h) => [h.key, h.value]));
    expect(headers["Referrer-Policy"]).toBe("no-referrer");
    expect(headers["X-Robots-Tag"]).toBe("noindex, nofollow");
  });

  it("página do convite (token na URL): sem referrer e fora dos buscadores", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const rule = rules.find((r) => r.source === "/convite/:path*");
    const headers = Object.fromEntries((rule?.headers ?? []).map((h) => [h.key, h.value]));
    expect(headers["Referrer-Policy"]).toBe("no-referrer");
    expect(headers["X-Robots-Tag"]).toBe("noindex, nofollow");
  });

  it("define os cabeçalhos fixos", async () => {
    const headers = await allHeaders();
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Content-Security-Policy"]).toBe("frame-ancestors 'none'");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("HSTS só em produção", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await allHeaders())["Strict-Transport-Security"]).toBe(
      "max-age=31536000; includeSubDomains",
    );
    vi.stubEnv("NODE_ENV", "development");
    expect((await allHeaders())["Strict-Transport-Security"]).toBeUndefined();
  });
});
