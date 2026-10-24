import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("nomes dos cookies", () => {
  it("cookieName só usa o prefixo __Host- em produção", async () => {
    const { cookieName } = await import("@/server/auth/cookie-names");
    expect(cookieName("ea_oauth_state", "production")).toBe("__Host-ea_oauth_state");
    expect(cookieName("ea_oauth_state", "development")).toBe("ea_oauth_state");
    expect(cookieName("ea_oauth_state", "test")).toBe("ea_oauth_state");
    expect(cookieName("ea_oauth_state", undefined)).toBe("ea_oauth_state");
  });

  it("fora de produção os nomes são os simples", async () => {
    const names = await import("@/server/auth/cookie-names");
    expect(names.SESSION_COOKIE).toBe("ea_session");
    expect(names.OAUTH_STATE_COOKIE).toBe("ea_oauth_state");
    expect(names.OAUTH_VERIFIER_COOKIE).toBe("ea_oauth_verifier");
    expect(names.OAUTH_INTENT_COOKIE).toBe("ea_oauth_intent");
    expect(names.GOOGLE_PENDING_COOKIE).toBe("ea_google_pending");
  });

  it("em produção a sessão, os cookies de OAuth e o pendente ganham __Host-; o rótulo do HMAC não muda", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const names = await import("@/server/auth/cookie-names");
    expect(names.SESSION_COOKIE).toBe("__Host-ea_session");
    expect(names.OAUTH_STATE_COOKIE).toBe("__Host-ea_oauth_state");
    expect(names.OAUTH_VERIFIER_COOKIE).toBe("__Host-ea_oauth_verifier");
    expect(names.OAUTH_INTENT_COOKIE).toBe("__Host-ea_oauth_intent");
    expect(names.GOOGLE_PENDING_COOKIE).toBe("__Host-ea_google_pending");
    expect(names.GOOGLE_PENDING_PURPOSE).toBe("ea_google_pending");
  });

  it("em produção login/cadastro gravam, lêem e apagam a sessão com o nome __Host-ea_session", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const jar = new Map<string, { value: string; options: Record<string, unknown> }>();
    vi.doMock("next/headers", () => ({
      cookies: async () => ({
        get: (name: string) => (jar.has(name) ? { value: jar.get(name)!.value } : undefined),
        set: (name: string, value: string, options: Record<string, unknown>) => {
          jar.set(name, { value, options });
        },
      }),
      headers: async () => new Headers(),
    }));
    const destroyed: string[] = [];
    vi.doMock("@/server/auth/session", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/server/auth/session")>()),
      destroySession: async (_db: unknown, token: string) => {
        destroyed.push(token);
      },
    }));
    const { setSessionCookie, destroyCurrentSession } = await import("@/server/auth/cookie");

    await setSessionCookie("token-novo");
    expect([...jar.keys()]).toEqual(["__Host-ea_session"]);
    expect(jar.get("__Host-ea_session")?.options).toMatchObject({ secure: true, path: "/", httpOnly: true });

    await destroyCurrentSession({} as never);
    expect(destroyed).toEqual(["token-novo"]);
    vi.doUnmock("@/server/auth/session");
  });

  it("o cookie __Host- só vale com Secure, path / e sem Domain (as opções de produção cumprem)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    vi.doMock("next/headers", () => ({ cookies: async () => ({}), headers: async () => new Headers() }));
    const { sessionCookieOptions } = await import("@/server/auth/cookie");
    const options = sessionCookieOptions(600) as Record<string, unknown>;
    expect(options).toMatchObject({ secure: true, path: "/", httpOnly: true });
    expect(options).not.toHaveProperty("domain");
  });
});
