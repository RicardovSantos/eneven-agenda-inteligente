import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberships, professionals, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { createSession, getSession } from "@/server/auth/session";
import { signInviteCookie } from "@/server/auth/invite-cookie";
import { sendEmail } from "@/server/email/send";
import { resetRateLimitsForTests } from "@/server/security/limits";
import { inviteMemberForTests } from "@/server/team/invitations";
import { createTestDb } from "../helpers/test-db";
import { seedOwnerTenant } from "../helpers/team-fixtures";

// --- dublês do ambiente Next ---
const state = vi.hoisted(() => ({
  db: undefined as unknown,
  jar: new Map<string, string>(),
  ip: "198.51.100.7",
  claims: {} as Record<string, unknown>,
  exchangeFails: false,
}));

vi.mock("@/db/client", () => ({ getDb: async () => state.db }));
vi.mock("@/server/email/send", () => ({ sendEmail: vi.fn(async () => {}) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.jar.has(name) ? { value: state.jar.get(name) } : undefined),
    set: (name: string, value: string) => {
      if (value === "") state.jar.delete(name);
      else state.jar.set(name, value);
    },
  }),
  headers: async () => new Headers({ "x-forwarded-for": state.ip }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("arctic", () => ({
  Google: class {
    constructor(
      readonly clientId: string,
      readonly clientSecret: string,
      readonly redirectUri: string,
    ) {}
    createAuthorizationURL(oauthState: string) {
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("state", oauthState);
      return url;
    }
    validateAuthorizationCode() {
      return state.exchangeFails
        ? Promise.reject(new Error("access_denied"))
        : Promise.resolve({ idToken: () => "id-token" });
    }
  },
  generateState: () => "state-fixo",
  generateCodeVerifier: () => "verifier-fixo",
  decodeIdToken: () => state.claims,
}));

const redirectOf = async (promise: Promise<unknown>) =>
  (
    await promise.then(
      () => null,
      (e: unknown) => e as Error,
    )
  )?.message ?? null;
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

const APP_URL = "https://agenda.teste";

describe("aceite de convite: telas e ações", () => {
  let db: Db;
  let tenantId: string;
  let owner: Awaited<ReturnType<typeof seedOwnerTenant>>;
  let proId: string;
  let invite: typeof import("@/app/convite/[token]/actions");
  let authActions: typeof import("@/app/(auth)/actions");

  const issue = async (email: string, role: "reception" | "staff" = "reception", name = "Rita") =>
    (
      await inviteMemberForTests(db, owner.actor, {
        name,
        email,
        role,
        professionalId: role === "staff" ? proId : undefined,
      })
    ).token;

  const sessionTenant = async () => {
    const token = state.jar.get("ea_session");
    expect(token).toBeDefined();
    return getSession(db, token as string);
  };

  beforeEach(async () => {
    vi.stubEnv("SESSION_SECRET", "segredo-de-teste-segredo-de-teste-1234");
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id-teste");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret-teste");
    vi.stubEnv("APP_URL", APP_URL);
    vi.resetModules();
    vi.mocked(sendEmail).mockResolvedValue(undefined);
    state.jar = new Map();
    state.ip = "198.51.100.7";
    state.exchangeFails = false;
    db = await createTestDb();
    state.db = db;
    owner = await seedOwnerTenant(db, "Studio Defendi", "dona@defendi.com");
    tenantId = owner.tenantId;
    const [pro] = await db
      .insert(professionals)
      .values({ tenantId, name: "Bia", color: "#B4237A", active: true })
      .returning({ id: professionals.id });
    proId = pro.id;
    invite = await import("@/app/convite/[token]/actions");
    authActions = await import("@/app/(auth)/actions");
    (await import("@/server/security/limits")).resetRateLimitsForTests();
    resetRateLimitsForTests();
  });

  afterEach(() => vi.unstubAllEnvs());

  describe("senha (e-mail sem conta)", () => {
    it("cria o acesso, abre a sessão no estabelecimento do convite e vai para /painel", async () => {
      const token = await issue("rita@x.com");
      const go = await redirectOf(
        invite.acceptInviteAction({}, form({ token, name: "Rita Lima", password: "senha-forte-9" })),
      );
      expect(go).toBe("NEXT_REDIRECT:/painel");
      expect(await sessionTenant()).toMatchObject({ tenantId, role: "reception" });
    });

    it("profissional: a sessão tem o papel staff", async () => {
      const token = await issue("bia@x.com", "staff", "Bia");
      await redirectOf(
        invite.acceptInviteAction({}, form({ token, name: "Bia", password: "senha-forte-9" })),
      );
      expect(await sessionTenant()).toMatchObject({ tenantId, role: "staff" });
    });

    it("senha fraca: erro no campo, sem sessão e o convite continua valendo", async () => {
      const token = await issue("rita@x.com");
      const result = await invite.acceptInviteAction(
        {},
        form({ token, name: "Rita", password: "123" }),
      );
      expect(result.fieldErrors?.password).toBeDefined();
      expect(state.jar.has("ea_session")).toBe(false);
      const again = await redirectOf(
        invite.acceptInviteAction({}, form({ token, name: "Rita", password: "senha-forte-9" })),
      );
      expect(again).toBe("NEXT_REDIRECT:/painel");
    });

    it("convite usado, inventado ou vazio: mensagem de convite que não vale mais", async () => {
      const token = await issue("rita@x.com");
      await redirectOf(
        invite.acceptInviteAction({}, form({ token, name: "Rita", password: "senha-forte-9" })),
      );
      state.jar = new Map();
      for (const t of [token, "inventado", ""]) {
        const result = await invite.acceptInviteAction(
          {},
          form({ token: t, name: "Rita", password: "senha-forte-9" }),
        );
        expect(result.error).toBe("Este convite não vale mais. Peça um novo a quem convidou você.");
      }
      expect(state.jar.has("ea_session")).toBe(false);
    });

    it("e-mail que já tem conta: não troca a senha e pede para entrar", async () => {
      // A conta passa a existir depois do envio do convite (corrida).
      const token = await issue("tarde@x.com");
      await db.insert(users).values({
        email: "tarde@x.com",
        name: "Tarde",
        passwordHash: null,
        emailVerifiedAt: new Date(),
      });
      const result = await invite.acceptInviteAction(
        {},
        form({ token, name: "Tarde", password: "senha-forte-9" }),
      );
      expect(result.error).toBe("Entre com tarde@x.com para aceitar.");
      expect(state.jar.has("ea_session")).toBe(false);
    });

    it("limita as tentativas por IP (10 / 15 min), antes de gastar o convite", async () => {
      const token = await issue("rita@x.com");
      for (let i = 0; i < 10; i++) {
        await invite.acceptInviteAction({}, form({ token, name: "Rita", password: "1" }));
      }
      const blocked = await invite.acceptInviteAction(
        {},
        form({ token, name: "Rita", password: "senha-forte-9" }),
      );
      expect(blocked.error).toMatch(/Muitas tentativas/);
      expect(state.jar.has("ea_session")).toBe(false);
      // Outro IP segue normal.
      state.ip = "198.51.100.8";
      const ok = await redirectOf(
        invite.acceptInviteAction({}, form({ token, name: "Rita", password: "senha-forte-9" })),
      );
      expect(ok).toBe("NEXT_REDIRECT:/painel");
    });

    it("convite de proprietário: só a senha; define a senha do dono e abre a sessão", async () => {
      const { createOwnerAccessInviteForTests } = await import("@/server/team/invitations");
      const { token } = await createOwnerAccessInviteForTests(db, tenantId, owner.userId);
      const go = await redirectOf(
        invite.acceptInviteAction({}, form({ token, password: "nova-senha-forte-3" })),
      );
      expect(go).toBe("NEXT_REDIRECT:/painel");
      expect(await sessionTenant()).toMatchObject({ tenantId, role: "owner", userId: owner.userId });
    });
  });

  describe("conta existente", () => {
    const createAccount = async (email: string, password: string | null = "senha-da-rita-1") => {
      const [row] = await db
        .insert(users)
        .values({
          email,
          name: "Rita",
          passwordHash: password ? await (await import("@/server/auth/password")).hashPassword(password) : null,
          emailVerifiedAt: new Date(),
        })
        .returning({ id: users.id });
      return row.id;
    };

    it("login com ?convite: aceita o convite e a sessão nasce no estabelecimento do convite", async () => {
      const token = await issue("rita@x.com");
      await createAccount("rita@x.com");
      const go = await redirectOf(
        authActions.loginAction(
          {},
          form({ email: "rita@x.com", password: "senha-da-rita-1", convite: token }),
        ),
      );
      expect(go).toBe("NEXT_REDIRECT:/painel");
      expect(await sessionTenant()).toMatchObject({ tenantId, role: "reception" });
      expect(
        await db.select().from(memberships).where(eq(memberships.tenantId, tenantId)),
      ).toHaveLength(2);
    });

    it("login com ?convite de outra conta: entra normalmente e volta ao convite, que explica o erro", async () => {
      const token = await issue("rita@x.com");
      await createAccount("outra@x.com", "senha-da-outra-1");
      const go = await redirectOf(
        authActions.loginAction(
          {},
          form({ email: "outra@x.com", password: "senha-da-outra-1", convite: token }),
        ),
      );
      expect(go).toBe(`NEXT_REDIRECT:/convite/${token}?erro=conta`);
      // Sessão comum (sem estabelecimento): não vira membro do convite.
      expect((await sessionTenant())?.tenantId).toBeNull();
      expect(await db.select().from(memberships).where(eq(memberships.tenantId, tenantId))).toHaveLength(1);
    });

    it("login sem ?convite continua igual", async () => {
      await createAccount("rita@x.com");
      const go = await redirectOf(
        authActions.loginAction({}, form({ email: "rita@x.com", password: "senha-da-rita-1" })),
      );
      expect(go).toBe("NEXT_REDIRECT:/painel");
    });

    it("botão 'Aceitar convite' (sessão com o mesmo e-mail) aceita pelo usuário da sessão", async () => {
      const token = await issue("rita@x.com");
      const userId = await createAccount("rita@x.com");
      state.jar.set("ea_session", await createSession(db, userId, null));
      const go = await redirectOf(invite.acceptInviteAsCurrentUserAction({}, form({ token })));
      expect(go).toBe("NEXT_REDIRECT:/painel");
      expect(await sessionTenant()).toMatchObject({ userId, tenantId, role: "reception" });
    });

    it("botão 'Aceitar convite' com sessão de outro e-mail: erro, nada muda", async () => {
      const token = await issue("rita@x.com");
      const other = await createAccount("outra@x.com");
      const sessionToken = await createSession(db, other, null);
      state.jar.set("ea_session", sessionToken);
      const result = await invite.acceptInviteAsCurrentUserAction({}, form({ token }));
      expect(result.error).toBe("Entre com rita@x.com para aceitar.");
      expect(state.jar.get("ea_session")).toBe(sessionToken);
    });

    it("botão 'Aceitar convite' sem sessão: manda entrar", async () => {
      const token = await issue("rita@x.com");
      const go = await redirectOf(invite.acceptInviteAsCurrentUserAction({}, form({ token })));
      expect(go).toBe(`NEXT_REDIRECT:/entrar?convite=${token}`);
    });
  });

  describe("Google", () => {
    const callback = async (cookies: Record<string, string>) => {
      const { GET } = await import("@/app/api/auth/google/callback/route");
      const cookie = Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
      return GET(
        new NextRequest("http://interno:3000/api/auth/google/callback?code=c&state=state-fixo", {
          headers: { cookie, "x-forwarded-for": state.ip },
        }),
      );
    };
    const flowCookies = (intent: string) => ({
      ea_oauth_state: "state-fixo",
      ea_oauth_verifier: "verifier-fixo",
      ea_oauth_intent: intent,
    });
    const claims = (email: string, extra: Record<string, unknown> = {}) => ({
      iss: "https://accounts.google.com",
      aud: "client-id-teste",
      sub: "google-sub-77",
      email,
      email_verified: true,
      name: "Rita Google",
      picture: null,
      ...extra,
    });

    it("GET /convite/{token}/google guarda o token num cookie assinado e inicia o fluxo com intent=invite", async () => {
      const token = await issue("rita@gmail.com");
      const { GET } = await import("@/app/convite/[token]/google/route");
      const response = await GET(new NextRequest(`http://interno:3000/convite/${token}/google`), {
        params: Promise.resolve({ token }),
      });
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get("location")!).origin).toBe("https://accounts.google.com");
      const cookie = response.cookies.get("ea_invite");
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
      expect(cookie?.value).not.toContain(token); // assinado e codificado, não texto puro na URL
      expect(response.cookies.get("ea_oauth_intent")?.value).toBe("invite");
    });

    it("convite inexistente: volta ao convite (que mostra o aviso), sem cookie nem Google", async () => {
      const { GET } = await import("@/app/convite/[token]/google/route");
      const response = await GET(new NextRequest("http://interno:3000/convite/xx/google"), {
        params: Promise.resolve({ token: "xx" }),
      });
      expect(response.headers.get("location")).toBe(`${APP_URL}/convite/xx`);
      expect(response.cookies.get("ea_invite")).toBeUndefined();
    });

    it("retorno com o cookie do convite: aceita pelo perfil do Google, abre a sessão no tenant e apaga o cookie", async () => {
      const token = await issue("rita@gmail.com");
      state.claims = claims("Rita@Gmail.com");
      const response = await callback({
        ...flowCookies("invite"),
        ea_invite: signInviteCookie(token),
      });
      expect(response.headers.get("location")).toBe(`${APP_URL}/painel`);
      const session = await getSession(db, response.cookies.get("ea_session")!.value);
      expect(session).toMatchObject({ tenantId, role: "reception" });
      expect(response.cookies.get("ea_invite")).toMatchObject({ value: "", maxAge: 0 });
    });

    it("e-mail do Google diferente do convite: volta ao convite com erro e sem sessão", async () => {
      const token = await issue("rita@gmail.com");
      state.claims = claims("outra@gmail.com");
      const response = await callback({
        ...flowCookies("invite"),
        ea_invite: signInviteCookie(token),
      });
      expect(response.headers.get("location")).toBe(`${APP_URL}/convite/${token}?erro=conta`);
      expect(response.cookies.get("ea_session")).toBeUndefined();
      expect(response.cookies.get("ea_invite")).toMatchObject({ value: "", maxAge: 0 });
      expect(await db.select().from(memberships).where(eq(memberships.tenantId, tenantId))).toHaveLength(1);
    });

    it("e-mail não verificado no Google: erro do Google, sem sessão", async () => {
      const token = await issue("rita@gmail.com");
      state.claims = claims("rita@gmail.com", { email_verified: false });
      const response = await callback({
        ...flowCookies("invite"),
        ea_invite: signInviteCookie(token),
      });
      expect(response.cookies.get("ea_session")).toBeUndefined();
      expect(response.headers.get("location")).toBe(`${APP_URL}/convite/${token}?erro=google`);
    });

    it("cookie do convite adulterado ou sem intent=invite é ignorado: fluxo normal do Google", async () => {
      const token = await issue("rita@gmail.com");
      state.claims = claims("rita@gmail.com");
      const tampered = `${signInviteCookie(token)}x`;
      const a = await callback({ ...flowCookies("invite"), ea_invite: tampered });
      expect(a.headers.get("location")).toBe(`${APP_URL}/entrar?erro=google`);
      const b = await callback({ ...flowCookies("login"), ea_invite: signInviteCookie(token) });
      // Conta nova pelo fluxo normal: vai completar o cadastro, nunca entra no convite.
      expect(b.headers.get("location")).toBe(`${APP_URL}/cadastro/completar`);
      expect(await db.select().from(memberships).where(eq(memberships.tenantId, tenantId))).toHaveLength(1);
    });

    it("cancelou ou falhou no Google (troca do código): volta ao convite com erro=google", async () => {
      const token = await issue("rita@gmail.com");
      state.exchangeFails = true;
      const response = await callback({ ...flowCookies("invite"), ea_invite: signInviteCookie(token) });
      expect(response.headers.get("location")).toBe(`${APP_URL}/convite/${token}?erro=google`);
      expect(response.cookies.get("ea_session")).toBeUndefined();
    });

    it("convite de proprietário com Google de conta nova: erro=conta (a página pede o e-mail certo)", async () => {
      const { createOwnerAccessInviteForTests } = await import("@/server/team/invitations");
      const { token } = await createOwnerAccessInviteForTests(db, tenantId, owner.userId);
      state.claims = claims("novo-dono@gmail.com");
      const response = await callback({ ...flowCookies("invite"), ea_invite: signInviteCookie(token) });
      expect(response.headers.get("location")).toBe(`${APP_URL}/convite/${token}?erro=conta`);
    });

    it("profissional já ligado a outra pessoa: erro=invalido", async () => {
      const token = await issue("bia@gmail.com", "staff", "Bia");
      await db.update(professionals).set({ userId: owner.userId }).where(eq(professionals.id, proId));
      state.claims = claims("bia@gmail.com");
      const response = await callback({ ...flowCookies("invite"), ea_invite: signInviteCookie(token) });
      expect(response.headers.get("location")).toBe(`${APP_URL}/convite/${token}?erro=invalido`);
      expect(response.cookies.get("ea_session")).toBeUndefined();
    });

    it("GET /convite/{token}/google respeita o limite por IP antes de ler o banco", async () => {
      const token = await issue("rita@gmail.com");
      const limits = await import("@/server/security/limits");
      for (let i = 0; i < 120; i++) limits.limitPublicRead(state.ip);
      const { GET } = await import("@/app/convite/[token]/google/route");
      const response = await GET(
        new NextRequest(`http://interno:3000/convite/${token}/google`, {
          headers: { "x-forwarded-for": state.ip },
        }),
        { params: Promise.resolve({ token }) },
      );
      expect(response.headers.get("location")).toBe(`${APP_URL}/convite/${token}?erro=limite`);
      expect(response.cookies.get("ea_invite")).toBeUndefined();
    });

    it("limita as tentativas por IP também no retorno do Google", async () => {
      const token = await issue("rita@gmail.com");
      state.claims = claims("rita@gmail.com");
      const limits = await import("@/server/security/limits");
      for (let i = 0; i < 10; i++) limits.limitAcceptInvite(state.ip);
      const response = await callback({
        ...flowCookies("invite"),
        ea_invite: signInviteCookie(token),
      });
      expect(response.headers.get("location")).toBe(`${APP_URL}/convite/${token}?erro=limite`);
      expect(response.cookies.get("ea_session")).toBeUndefined();
    });
  });
});
