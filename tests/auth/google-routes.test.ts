import { eq } from "drizzle-orm";
import { NextRequest, type NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberships, sessions, users } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  GOOGLE_PENDING_PURPOSE,
  completeGoogleSignup,
  type GoogleProfile,
} from "@/server/auth/google";
import { createSession, getSession, hashToken } from "@/server/auth/session";
import { verifyValue } from "@/server/auth/signed-cookie";
import { signup } from "@/server/auth/signup";
import { createTestDb } from "../helpers/test-db";

// --- dublês: banco e arctic ---
const state = vi.hoisted(() => ({
  db: undefined as unknown,
  claims: {} as Record<string, unknown>,
  exchange: vi.fn(),
}));

vi.mock("@/db/client", () => ({ getDb: async () => state.db }));
vi.mock("arctic", () => ({
  Google: class {
    constructor(
      readonly clientId: string,
      readonly clientSecret: string,
      readonly redirectUri: string,
    ) {}
    createAuthorizationURL(oauthState: string, verifier: string, scopes: string[]) {
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("client_id", this.clientId);
      url.searchParams.set("redirect_uri", this.redirectUri);
      url.searchParams.set("state", oauthState);
      url.searchParams.set("code_challenge", `challenge-of-${verifier}`);
      url.searchParams.set("scope", scopes.join(" "));
      return url;
    }
    validateAuthorizationCode(code: string, verifier: string) {
      return state.exchange(code, verifier);
    }
  },
  generateState: () => "state-fixo",
  generateCodeVerifier: () => "verifier-fixo",
  decodeIdToken: () => state.claims,
}));

const APP_URL = "https://agenda.teste";

const claims = (extra: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: "client-id-teste",
  sub: "google-sub-1",
  email: "Bia@Gmail.com",
  email_verified: true,
  name: "Bia Lima",
  picture: "https://lh3.googleusercontent.com/a/bia",
  ...extra,
});

function callbackRequest(options: {
  query?: string;
  cookies?: Record<string, string>;
}) {
  const cookie = Object.entries(options.cookies ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest(`http://interno:3000/api/auth/google/callback${options.query ?? ""}`, {
    headers: cookie ? { cookie } : {},
  });
}

const goodCookies = {
  ea_oauth_state: "state-fixo",
  ea_oauth_verifier: "verifier-fixo",
  ea_oauth_intent: "signup",
};
const goodQuery = "?code=codigo-123&state=state-fixo";

const expectOauthCookiesCleared = (response: NextResponse) => {
  for (const name of ["ea_oauth_state", "ea_oauth_verifier", "ea_oauth_intent"]) {
    const cookie = response.cookies.get(name);
    expect(cookie, name).toBeDefined();
    expect(cookie?.value).toBe("");
    expect(cookie?.maxAge).toBe(0);
  }
};

const location = (response: Response) => response.headers.get("location");

describe("rotas do Google", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createTestDb();
    state.db = db;
    state.claims = claims();
    state.exchange.mockReset();
    state.exchange.mockResolvedValue({ idToken: () => "id-token" });
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id-teste");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret-teste");
    vi.stubEnv("APP_URL", APP_URL);
    vi.stubEnv("SESSION_SECRET", "segredo-de-teste-segredo-de-teste-1234");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("GET /api/auth/google", () => {
    const start = async (query = "?intent=signup") => {
      const { GET } = await import("@/app/api/auth/google/route");
      return GET(new NextRequest(`http://interno:3000/api/auth/google${query}`));
    };

    it("sem credenciais volta para /entrar?erro=google", async () => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "");
      const response = await start();
      expect(response.status).toBe(307);
      expect(location(response)).toBe(`${APP_URL}/entrar?erro=google`);
    });

    it("redireciona ao Google com state e PKCE e grava os três cookies", async () => {
      const response = await start("?intent=signup");
      expect(response.status).toBe(307);
      const target = new URL(location(response)!);
      expect(target.origin + target.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
      expect(target.searchParams.get("redirect_uri")).toBe(`${APP_URL}/api/auth/google/callback`);
      expect(target.searchParams.get("state")).toBe("state-fixo");
      expect(target.searchParams.get("code_challenge")).toBe("challenge-of-verifier-fixo");
      expect(target.searchParams.get("scope")).toBe("openid email profile");

      for (const [name, value] of [
        ["ea_oauth_state", "state-fixo"],
        ["ea_oauth_verifier", "verifier-fixo"],
        ["ea_oauth_intent", "signup"],
      ] as const) {
        const cookie = response.cookies.get(name);
        expect(cookie).toMatchObject({
          value,
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: 600,
        });
      }
    });

    it("intenção desconhecida vira login", async () => {
      const response = await start("?intent=qualquer");
      expect(response.cookies.get("ea_oauth_intent")?.value).toBe("login");
    });
  });

  describe("em produção (nomes __Host-)", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
      vi.resetModules();
    });

    afterEach(() => {
      // Os nomes dos cookies são fixados ao carregar o módulo: descarta os de produção.
      vi.resetModules();
    });

    it("o início grava os cookies do fluxo com prefixo __Host-, Secure e sem Domain", async () => {
      const { GET } = await import("@/app/api/auth/google/route");
      const response = await GET(new NextRequest("http://interno:3000/api/auth/google?intent=signup"));
      for (const [name, value] of [
        ["__Host-ea_oauth_state", "state-fixo"],
        ["__Host-ea_oauth_verifier", "verifier-fixo"],
        ["__Host-ea_oauth_intent", "signup"],
      ] as const) {
        expect(response.cookies.get(name)).toMatchObject({
          value,
          secure: true,
          path: "/",
          httpOnly: true,
        });
        expect(response.cookies.get(name)?.domain).toBeUndefined();
      }
      expect(response.cookies.get("ea_oauth_state")).toBeUndefined();
    });

    it("o retorno lê os cookies __Host-, apaga os do fluxo e grava o pendente com __Host-", async () => {
      const { GET } = await import("@/app/api/auth/google/callback/route");
      const response = await GET(
        callbackRequest({
          query: goodQuery,
          cookies: {
            "__Host-ea_oauth_state": "state-fixo",
            "__Host-ea_oauth_verifier": "verifier-fixo",
            "__Host-ea_oauth_intent": "signup",
          },
        }),
      );
      expect(location(response)).toBe(`${APP_URL}/cadastro/completar`);
      for (const name of [
        "__Host-ea_oauth_state",
        "__Host-ea_oauth_verifier",
        "__Host-ea_oauth_intent",
      ]) {
        expect(response.cookies.get(name)).toMatchObject({ value: "", maxAge: 0, secure: true });
      }
      const pending = response.cookies.get("__Host-ea_google_pending");
      expect(pending).toMatchObject({ secure: true, httpOnly: true, path: "/" });
      expect(verifyValue(pending!.value, GOOGLE_PENDING_PURPOSE)).toMatchObject({
        sub: "google-sub-1",
      });
    });

    it("login pelo Google grava __Host-ea_session e apaga a sessão antiga (também __Host-)", async () => {
      const account = await completeGoogleSignup(
        db,
        { sub: "google-sub-1", email: "bia@gmail.com", emailVerified: true, name: "Bia", picture: null },
        { businessName: "Studio Bela", whatsapp: "11988887777" },
      );
      const old = await createSession(db, account.userId, account.tenantId);
      const { GET } = await import("@/app/api/auth/google/callback/route");
      const response = await GET(
        callbackRequest({
          query: goodQuery,
          cookies: {
            "__Host-ea_oauth_state": "state-fixo",
            "__Host-ea_oauth_verifier": "verifier-fixo",
            "__Host-ea_oauth_intent": "login",
            "__Host-ea_session": old,
          },
        }),
      );
      expect(location(response)).toBe(`${APP_URL}/painel`);
      const cookie = response.cookies.get("__Host-ea_session");
      expect(cookie).toMatchObject({ secure: true, httpOnly: true, path: "/" });
      expect(response.cookies.get("ea_session")).toBeUndefined();
      expect(await getSession(db, old)).toBeNull();
      expect(await getSession(db, cookie!.value)).not.toBeNull();
    });

    it("o retorno sem APP_URL redireciona para /entrar?erro=google (não é um 500) e apaga os cookies", async () => {
      vi.stubEnv("APP_URL", "");
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { GET } = await import("@/app/api/auth/google/callback/route");
      const response = await GET(
        callbackRequest({
          query: goodQuery,
          cookies: {
            "__Host-ea_oauth_state": "state-fixo",
            "__Host-ea_oauth_verifier": "verifier-fixo",
            "__Host-ea_oauth_intent": "login",
          },
        }),
      );
      spy.mockRestore();
      expect(response.status).toBe(307);
      // Sem APP_URL não há endereço público confiável: o redirecionamento é relativo.
      expect(location(response)).toBe("/entrar?erro=google");
      expect(state.exchange).not.toHaveBeenCalled();
      expect(response.cookies.get("__Host-ea_session")).toBeUndefined();
      for (const name of [
        "__Host-ea_oauth_state",
        "__Host-ea_oauth_verifier",
        "__Host-ea_oauth_intent",
      ]) {
        expect(response.cookies.get(name)).toMatchObject({ value: "", maxAge: 0 });
      }
    });

    it("sem APP_URL não monta a URI de retorno a partir da requisição", async () => {
      vi.stubEnv("APP_URL", "");
      const { GET } = await import("@/app/api/auth/google/route");
      await expect(
        GET(new NextRequest("http://interno:3000/api/auth/google?intent=signup")),
      ).rejects.toThrow(/APP_URL/);
    });
  });

  describe("GET /api/auth/google/callback", () => {
    const call = async (request: NextRequest) => {
      const { GET } = await import("@/app/api/auth/google/callback/route");
      return GET(request);
    };

    it("state diferente do cookie: erro e cookies apagados, sem trocar o código", async () => {
      const response = await call(
        callbackRequest({ query: "?code=x&state=outro", cookies: goodCookies }),
      );
      expect(location(response)).toBe(`${APP_URL}/entrar?erro=google`);
      expect(state.exchange).not.toHaveBeenCalled();
      expectOauthCookiesCleared(response);
    });

    it.each([
      ["sem cookie de state", { ea_oauth_verifier: "v", ea_oauth_intent: "login" }],
      ["sem cookie de verifier", { ea_oauth_state: "state-fixo", ea_oauth_intent: "login" }],
      ["sem cookie de intent", { ea_oauth_state: "state-fixo", ea_oauth_verifier: "v" }],
      ["sem nenhum cookie", {}],
    ])("%s: erro", async (_name, cookies) => {
      const response = await call(callbackRequest({ query: goodQuery, cookies }));
      expect(location(response)).toBe(`${APP_URL}/entrar?erro=google`);
      expect(state.exchange).not.toHaveBeenCalled();
      expectOauthCookiesCleared(response);
    });

    it("usuário cancelou no Google (error=access_denied): erro", async () => {
      const response = await call(
        callbackRequest({ query: "?error=access_denied&state=state-fixo", cookies: goodCookies }),
      );
      expect(location(response)).toBe(`${APP_URL}/entrar?erro=google`);
      expectOauthCookiesCleared(response);
    });

    it("falha ao trocar o código: erro", async () => {
      state.exchange.mockRejectedValue(new Error("invalid_grant"));
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const response = await call(callbackRequest({ query: goodQuery, cookies: goodCookies }));
      spy.mockRestore();
      expect(location(response)).toBe(`${APP_URL}/entrar?erro=google`);
      expect(state.exchange).toHaveBeenCalledWith("codigo-123", "verifier-fixo");
      expectOauthCookiesCleared(response);
    });

    it("id_token de outro cliente (aud): erro", async () => {
      state.claims = claims({ aud: "outro-cliente" });
      const response = await call(callbackRequest({ query: goodQuery, cookies: goodCookies }));
      expect(location(response)).toBe(`${APP_URL}/entrar?erro=google`);
    });

    it("e-mail não verificado no Google: erro", async () => {
      state.claims = claims({ email_verified: false });
      const response = await call(callbackRequest({ query: goodQuery, cookies: goodCookies }));
      expect(location(response)).toBe(`${APP_URL}/entrar?erro=google`);
      expect(response.cookies.get("ea_session")).toBeUndefined();
      expect(response.cookies.get("ea_google_pending")).toBeUndefined();
    });

    it("usuário novo (inclusive vindo de intent=login): cookie pendente assinado e vai para /cadastro/completar", async () => {
      // email_verified como texto "true" também vale
      state.claims = claims({ email_verified: "true" });
      const response = await call(
        callbackRequest({
          query: goodQuery,
          cookies: { ...goodCookies, ea_oauth_intent: "login" },
        }),
      );
      expect(location(response)).toBe(`${APP_URL}/cadastro/completar`);
      expect(response.cookies.get("ea_session")).toBeUndefined();

      const pending = response.cookies.get("ea_google_pending")!;
      expect(pending).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 900 });
      expect(verifyValue<GoogleProfile>(pending.value, GOOGLE_PENDING_PURPOSE)).toEqual({
        sub: "google-sub-1",
        email: "bia@gmail.com",
        emailVerified: true,
        name: "Bia Lima",
        picture: "https://lh3.googleusercontent.com/a/bia",
      });
      expectOauthCookiesCleared(response);
    });

    it("usuário existente com um estabelecimento: cria sessão e vai para /painel", async () => {
      const account = await completeGoogleSignup(
        db,
        { sub: "google-sub-1", email: "bia@gmail.com", emailVerified: true, name: "Bia", picture: null },
        { businessName: "Studio Bela", whatsapp: "11988887777" },
      );
      const response = await call(callbackRequest({ query: goodQuery, cookies: goodCookies }));
      expect(location(response)).toBe(`${APP_URL}/painel`);
      expect(response.cookies.get("ea_google_pending")).toBeUndefined();

      const cookie = response.cookies.get("ea_session")!;
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
      const session = await getSession(db, cookie.value);
      expect(session).toMatchObject({
        userId: account.userId,
        tenantId: account.tenantId,
        role: "owner",
        emailVerified: true,
      });
      expectOauthCookiesCleared(response);
    });

    it("quem já tinha um cookie de sessão antigo perde a sessão antiga ao entrar", async () => {
      const account = await completeGoogleSignup(
        db,
        { sub: "google-sub-1", email: "bia@gmail.com", emailVerified: true, name: "Bia", picture: null },
        { businessName: "Studio Bela", whatsapp: "11988887777" },
      );
      const old = await createSession(db, account.userId, account.tenantId);

      const response = await call(
        callbackRequest({ query: goodQuery, cookies: { ...goodCookies, ea_session: old } }),
      );

      expect(location(response)).toBe(`${APP_URL}/painel`);
      expect(await getSession(db, old)).toBeNull();
      expect(await getSession(db, response.cookies.get("ea_session")!.value)).not.toBeNull();
    });

    it("e-mail de conta com senha: vincula e entra no único estabelecimento", async () => {
      const ana = await signup(db, {
        businessName: "Defendi",
        ownerName: "Ana",
        email: "ana@defendi.com",
        password: "senha-forte-1",
        whatsapp: "11999999999",
      });
      state.claims = claims({ sub: "sub-ana", email: "ana@defendi.com" });
      const response = await call(callbackRequest({ query: goodQuery, cookies: goodCookies }));
      expect(location(response)).toBe(`${APP_URL}/painel`);
      const token = (response.cookies.get("ea_session") as { value: string }).value;
      const [row] = await db.select().from(sessions).where(eq(sessions.id, hashToken(token)));
      expect(row.userId).toBe(ana.userId);
      expect(row.tenantId).toBe(ana.tenantId);
    });

    it("super-admin sem estabelecimento: cria a sessão e vai para /admin", async () => {
      const [admin] = await db
        .insert(users)
        .values({ email: "root@eneven.com", passwordHash: null, name: "Root", isSuperAdmin: true })
        .returning();
      state.claims = claims({ sub: "sub-root", email: "root@eneven.com" });
      const response = await call(callbackRequest({ query: goodQuery, cookies: goodCookies }));
      expect(location(response)).toBe(`${APP_URL}/admin`);
      const token = (response.cookies.get("ea_session") as { value: string }).value;
      const [row] = await db.select().from(sessions).where(eq(sessions.id, hashToken(token)));
      expect(row.userId).toBe(admin.id);
      expect(row.tenantId).toBeNull();
    });

    it("usuário com vários estabelecimentos (ou nenhum): sessão sem tenant, como no login por senha", async () => {
      const ana = await signup(db, {
        businessName: "Defendi",
        ownerName: "Ana",
        email: "ana@defendi.com",
        password: "senha-forte-1",
        whatsapp: "11999999999",
      });
      const other = await signup(db, {
        businessName: "Outro Studio",
        ownerName: "Outra",
        email: "outra@defendi.com",
        password: "senha-forte-1",
        whatsapp: "11999999999",
      });
      await db.insert(memberships).values({ userId: ana.userId, tenantId: other.tenantId, role: "staff" });
      state.claims = claims({ sub: "sub-ana", email: "ana@defendi.com" });
      const response = await call(callbackRequest({ query: goodQuery, cookies: goodCookies }));
      expect(location(response)).toBe(`${APP_URL}/painel`);
      const token = (response.cookies.get("ea_session") as { value: string }).value;
      const [row] = await db.select().from(sessions).where(eq(sessions.id, hashToken(token)));
      expect(row.userId).toBe(ana.userId);
      expect(row.tenantId).toBeNull();
    });
  });
});
