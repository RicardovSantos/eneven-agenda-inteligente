import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sessions, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { signPendingProfile, type GoogleProfile } from "@/server/auth/google";
import { createSession, hashToken } from "@/server/auth/session";
import { signup } from "@/server/auth/signup";
import { sendEmail } from "@/server/email/send";
import { createTestDb } from "../helpers/test-db";

// --- dublês do ambiente Next ---
const state = vi.hoisted(() => ({
  db: undefined as unknown,
  jar: new Map<string, string>(),
  ip: "198.51.100.7",
  afterJobs: [] as Array<Promise<unknown>>,
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
vi.mock("next/server", () => ({
  after: (job: () => unknown) => {
    state.afterJobs.push(Promise.resolve().then(job));
  },
}));
vi.mock("@/server/auth/email-flows", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/email-flows")>();
  return { ...actual, requestPasswordReset: vi.fn(actual.requestPasswordReset) };
});

const sendEmailMock = vi.mocked(sendEmail);
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const redirectOf = async (promise: Promise<unknown>) =>
  (
    await promise.then(
      () => null,
      (e: unknown) => e as Error,
    )
  )?.message ?? null;
const flush = () => Promise.all(state.afterJobs.splice(0));

const profile: GoogleProfile = {
  sub: "google-sub-9",
  email: "bia@gmail.com",
  emailVerified: true,
  name: "Bia Lima",
  picture: null,
};

describe("ações de autenticação: rate limit e sessão antiga", () => {
  let db: Db;
  let actions: typeof import("@/app/(auth)/actions");
  let googleActions: typeof import("@/app/(auth)/google-actions");
  let limits: typeof import("@/server/security/limits");
  let emailFlows: typeof import("@/server/auth/email-flows");
  let ana: { userId: string; tenantId: string };

  beforeEach(async () => {
    vi.stubEnv("SESSION_SECRET", "segredo-de-teste-segredo-de-teste-1234");
    vi.resetModules();
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue(undefined);
    state.afterJobs = [];
    state.jar = new Map();
    state.ip = "198.51.100.7";
    db = await createTestDb();
    state.db = db;
    ana = await signup(db, {
      businessName: "Defendi Studio",
      ownerName: "Ana Souza",
      email: "ana@defendi.com",
      password: "senha-forte-1",
      whatsapp: "11999999999",
    });
    actions = await import("@/app/(auth)/actions");
    googleActions = await import("@/app/(auth)/google-actions");
    limits = await import("@/server/security/limits");
    emailFlows = await import("@/server/auth/email-flows");
    limits.resetRateLimitsForTests();
  });

  describe("login", () => {
    const login = (email: string, password: string) =>
      actions.loginAction({}, form({ email, password }));

    it("10 tentativas por IP + e-mail em 15 min; a 11ª é recusada, até com a senha certa", async () => {
      for (let i = 0; i < 10; i++) {
        expect((await login("ana@defendi.com", "errada-errada")).error).toBe(
          "E-mail ou senha incorretos.",
        );
      }
      const blocked = await login("ana@defendi.com", "senha-forte-1");
      expect(blocked).toEqual({ error: "Muitas tentativas. Tente de novo em 15 minutos." });
      expect(state.jar.has("ea_session")).toBe(false);
    });

    it("a chave é IP + e-mail: outro e-mail do mesmo IP ainda passa", async () => {
      for (let i = 0; i < 10; i++) await login("ana@defendi.com", "errada-errada");
      expect((await login("ana@defendi.com", "senha-forte-1")).error).toMatch(/Muitas tentativas/);
      expect((await login("outra@defendi.com", "qualquer-coisa")).error).toBe(
        "E-mail ou senha incorretos.",
      );
    });

    it("o mesmo e-mail vindo de outro IP não é afetado", async () => {
      for (let i = 0; i < 10; i++) await login("ana@defendi.com", "errada-errada");
      state.ip = "198.51.100.8";
      await expect(login("ana@defendi.com", "senha-forte-1")).rejects.toThrow(
        "NEXT_REDIRECT:/painel",
      );
    });

    it("e-mail com caixa diferente conta na mesma chave", async () => {
      for (let i = 0; i < 5; i++) await login("ana@defendi.com", "errada-errada");
      for (let i = 0; i < 5; i++) await login(" ANA@defendi.com ", "errada-errada");
      expect((await login("ana@defendi.com", "senha-forte-1")).error).toMatch(/Muitas tentativas/);
    });

    it("30 tentativas por IP em 15 min, mesmo trocando de e-mail", async () => {
      for (let i = 0; i < 30; i++) {
        expect((await login(`pessoa${i}@defendi.com`, "errada-errada")).error).toBe(
          "E-mail ou senha incorretos.",
        );
      }
      expect((await login("pessoa99@defendi.com", "errada-errada")).error).toMatch(
        /Muitas tentativas/,
      );
    });

    it("dados inválidos não gastam tentativas", async () => {
      for (let i = 0; i < 40; i++) {
        expect((await login("nao-e-email", "x")).fieldErrors?.email).toBeDefined();
      }
      await expect(login("ana@defendi.com", "senha-forte-1")).rejects.toThrow(
        "NEXT_REDIRECT:/painel",
      );
    });
  });

  describe("cadastro", () => {
    const signupWith = (n: number) =>
      actions.signupAction(
        {},
        form({
          businessName: `Studio ${n}`,
          ownerName: "Bia Lima",
          whatsapp: "11988887777",
          email: `bia${n}@novo.com`,
          password: "senha-forte-1",
        }),
      );

    it("5 cadastros por IP por hora; o 6º é recusado e nada é criado", async () => {
      for (let i = 0; i < 5; i++) {
        expect(await redirectOf(signupWith(i))).toBe("NEXT_REDIRECT:/painel");
      }
      const blocked = await signupWith(5);
      expect(blocked).toEqual({ error: "Muitas tentativas. Tente de novo em 60 minutos." });
      expect(await db.select().from(users).where(eq(users.email, "bia5@novo.com"))).toHaveLength(0);
    });

    it("dados inválidos não gastam tentativas", async () => {
      for (let i = 0; i < 10; i++) {
        const result = await actions.signupAction({}, form({ businessName: "", email: "x" }));
        expect(result.fieldErrors).toBeDefined();
      }
      expect(await redirectOf(signupWith(1))).toBe("NEXT_REDIRECT:/painel");
    });

    it("completar o cadastro do Google divide o mesmo limite de 5 por hora", async () => {
      state.jar.set("ea_google_pending", signPendingProfile(profile));
      for (let i = 0; i < 5; i++) limits.signupLimiter.hit(state.ip);
      const result = await googleActions.completeGoogleSignupAction(
        {},
        form({ businessName: "Studio Bela", whatsapp: "(11) 98888-7777" }),
      );
      expect(result.error).toMatch(/^Muitas tentativas\. Tente de novo em \d+ minutos\.$/);
      expect(await db.select().from(users)).toHaveLength(1); // só a Ana
    });
  });

  describe("recuperar senha", () => {
    const forgot = (email: string) => actions.forgotPasswordAction({}, form({ email }));

    it("5 por IP por hora: depois disso responde igual, mas não processa", async () => {
      for (let i = 0; i < 5; i++) expect(await forgot(`p${i}@defendi.com`)).toEqual({ sent: true });
      await flush();
      expect(vi.mocked(emailFlows.requestPasswordReset)).toHaveBeenCalledTimes(5);

      expect(await forgot("ana@defendi.com")).toEqual({ sent: true });
      await flush();
      expect(vi.mocked(emailFlows.requestPasswordReset)).toHaveBeenCalledTimes(5);
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("5 por e-mail por hora, mesmo vindo de IPs diferentes", async () => {
      for (let i = 0; i < 5; i++) {
        state.ip = `203.0.113.${i + 1}`;
        await forgot("ana@defendi.com");
      }
      await flush();
      expect(vi.mocked(emailFlows.requestPasswordReset)).toHaveBeenCalledTimes(5);

      state.ip = "203.0.113.99";
      expect(await forgot(" Ana@Defendi.com")).toEqual({ sent: true });
      await flush();
      expect(vi.mocked(emailFlows.requestPasswordReset)).toHaveBeenCalledTimes(5);
    });
  });

  describe("sessão antiga", () => {
    const sessionExists = async (token: string) =>
      (await db.select().from(sessions).where(eq(sessions.id, hashToken(token)))).length === 1;

    it("login apaga a sessão antiga do navegador e abre a nova", async () => {
      const old = await createSession(db, ana.userId, ana.tenantId);
      state.jar.set("ea_session", old);

      await expect(
        actions.loginAction({}, form({ email: "ana@defendi.com", password: "senha-forte-1" })),
      ).rejects.toThrow("NEXT_REDIRECT:/painel");

      expect(await sessionExists(old)).toBe(false);
      const fresh = state.jar.get("ea_session")!;
      expect(fresh).not.toBe(old);
      expect(await sessionExists(fresh)).toBe(true);
    });

    it("cadastro apaga a sessão antiga do navegador", async () => {
      const old = await createSession(db, ana.userId, ana.tenantId);
      state.jar.set("ea_session", old);

      await expect(
        actions.signupAction(
          {},
          form({
            businessName: "Novo Studio",
            ownerName: "Bia Lima",
            whatsapp: "11988887777",
            email: "bia@novo.com",
            password: "senha-forte-1",
          }),
        ),
      ).rejects.toThrow("NEXT_REDIRECT:/painel");

      expect(await sessionExists(old)).toBe(false);
      expect(await sessionExists(state.jar.get("ea_session")!)).toBe(true);
    });

    it("completar o cadastro do Google apaga a sessão antiga", async () => {
      const old = await createSession(db, ana.userId, ana.tenantId);
      state.jar.set("ea_session", old);
      state.jar.set("ea_google_pending", signPendingProfile(profile));

      await expect(
        googleActions.completeGoogleSignupAction(
          {},
          form({ businessName: "Studio Bela", whatsapp: "(11) 98888-7777" }),
        ),
      ).rejects.toThrow("NEXT_REDIRECT:/painel");

      expect(await sessionExists(old)).toBe(false);
    });

    it("cookie de sessão que não existe mais no banco não atrapalha", async () => {
      state.jar.set("ea_session", "token-que-nao-existe");
      await expect(
        actions.loginAction({}, form({ email: "ana@defendi.com", password: "senha-forte-1" })),
      ).rejects.toThrow("NEXT_REDIRECT:/painel");
    });
  });
});
