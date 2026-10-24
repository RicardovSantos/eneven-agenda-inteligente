import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emailTokens, sessions, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { issueEmailToken } from "@/server/auth/email-tokens";
import { createSession } from "@/server/auth/session";
import { signup } from "@/server/auth/signup";
import { sendEmail } from "@/server/email/send";
import { createTestDb } from "../helpers/test-db";

// --- dublês do ambiente Next ---
const state = vi.hoisted(() => ({
  db: undefined as unknown,
  sessionToken: undefined as string | undefined,
  afterJobs: [] as Array<Promise<unknown>>,
}));

vi.mock("@/db/client", () => ({ getDb: async () => state.db }));
vi.mock("@/server/email/send", () => ({ sendEmail: vi.fn(async () => {}) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "ea_session" && state.sessionToken ? { value: state.sessionToken } : undefined,
    set: vi.fn(),
  }),
  headers: async () => new Headers(),
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

const sendEmailMock = vi.mocked(sendEmail);
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const flush = () => Promise.all(state.afterJobs.splice(0));

describe("server actions de e-mail", () => {
  let db: Db;
  let userId: string;
  let tenantId: string;
  let actions: typeof import("@/app/(auth)/actions");

  beforeEach(async () => {
    vi.resetModules();
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue(undefined);
    state.afterJobs = [];
    db = await createTestDb();
    state.db = db;
    const account = await signup(db, {
      businessName: "Defendi Studio",
      ownerName: "Ana Souza",
      email: "ana@defendi.com",
      password: "senha-forte-1",
      whatsapp: "11999999999",
    });
    userId = account.userId;
    tenantId = account.tenantId;
    state.sessionToken = await createSession(db, userId, tenantId);
    actions = await import("@/app/(auth)/actions");
  });

  describe("signupAction", () => {
    it("envia o e-mail de confirmação e segue para o painel", async () => {
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

      await flush();
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect(sendEmailMock.mock.calls[0][0].to).toBe("bia@novo.com");
    });

    it("o envio roda depois da resposta (after) e não segura o cadastro", async () => {
      let release!: () => void;
      sendEmailMock.mockImplementation(
        () => new Promise<void>((resolve) => (release = resolve)),
      );

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

      // A resposta já saiu e o e-mail ainda está "enviando".
      expect(state.afterJobs).toHaveLength(1);
      await vi.waitFor(() => expect(sendEmailMock).toHaveBeenCalledTimes(1));
      release();
      await flush();
    });

    it("se o envio falhar, o token é apagado e 'Reenviar e-mail' funciona na hora", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      sendEmailMock.mockRejectedValueOnce(new Error("ZeptoMail fora do ar"));
      state.sessionToken = undefined;

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
      await flush();

      const [created] = await db.select().from(users).where(eq(users.email, "bia@novo.com"));
      expect(await db.select().from(emailTokens).where(eq(emailTokens.userId, created.id))).toHaveLength(0);
      log.mockRestore();
    });

    it("falha ao enviar o e-mail NÃO quebra o cadastro", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      sendEmailMock.mockRejectedValue(new Error("ZeptoMail fora do ar"));

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

      await flush();
      expect(log).toHaveBeenCalled();
      const [created] = await db.select().from(users).where(eq(users.email, "bia@novo.com"));
      expect(created).toBeDefined();
      log.mockRestore();
    });
  });

  describe("resendVerificationAction", () => {
    it("envia um novo link e mostra o sucesso com o e-mail", async () => {
      // O cadastro (sem passar pela action) não enviou nada: sem cooldown.
      const result = await actions.resendVerificationAction();
      expect(result).toEqual({ success: "Enviamos um novo link para ana@defendi.com." });
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
    });

    it("segundo clique em menos de 60 s é recusado", async () => {
      await actions.resendVerificationAction();
      const second = await actions.resendVerificationAction();
      expect(second).toEqual({ error: "Aguarde um minuto para reenviar." });
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
    });

    it("exige sessão do painel (sem sessão, vai para /entrar)", async () => {
      state.sessionToken = undefined;
      await expect(actions.resendVerificationAction()).rejects.toThrow(
        "NEXT_REDIRECT:/entrar",
      );
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("falha de envio vira mensagem amigável", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      sendEmailMock.mockRejectedValueOnce(new Error("ZeptoMail 500"));
      const result = await actions.resendVerificationAction();
      expect(result.error).toMatch(/Não foi possível enviar/);
      expect(result.success).toBeUndefined();
      log.mockRestore();
    });
  });

  describe("forgotPasswordAction", () => {
    it("responde igual para e-mail existente e inexistente (sem enumeração)", async () => {
      const existing = await actions.forgotPasswordAction({}, form({ email: "ana@defendi.com" }));
      await flush();
      const missing = await actions.forgotPasswordAction({}, form({ email: "ninguem@defendi.com" }));
      await flush();

      expect(existing).toEqual(missing);
      expect(existing).toEqual({ sent: true });
      // ...mas só a conta que existe recebe o e-mail.
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect(sendEmailMock.mock.calls[0][0].to).toBe("ana@defendi.com");
    });

    it("e-mail com formato inválido volta erro de campo", async () => {
      const result = await actions.forgotPasswordAction({}, form({ email: "nao-e-email" }));
      expect(result.fieldErrors?.email).toBe("Informe um e-mail válido.");
      expect(sendEmailMock).not.toHaveBeenCalled();
    });
  });

  describe("resetPasswordAction", () => {
    const now = new Date();

    it("troca a senha, apaga as sessões e vai para /entrar?senha=redefinida", async () => {
      const token = await issueEmailToken(db, userId, "reset", now);
      await expect(
        actions.resetPasswordAction(
          {},
          form({ token, password: "nova-senha-123", confirmPassword: "nova-senha-123" }),
        ),
      ).rejects.toThrow("NEXT_REDIRECT:/entrar?senha=redefinida");

      expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);
    });

    it("senhas diferentes: erro no campo de confirmação, link continua valendo", async () => {
      const token = await issueEmailToken(db, userId, "reset", now);
      const result = await actions.resetPasswordAction(
        {},
        form({ token, password: "nova-senha-123", confirmPassword: "outra-coisa-999" }),
      );
      expect(result.fieldErrors?.confirmPassword).toBe("As senhas não conferem.");
      const [row] = await db.select().from(emailTokens).where(eq(emailTokens.userId, userId));
      expect(row.usedAt).toBeNull();
    });

    it("senha curta: erro no campo", async () => {
      const token = await issueEmailToken(db, userId, "reset", now);
      const result = await actions.resetPasswordAction(
        {},
        form({ token, password: "curta", confirmPassword: "curta" }),
      );
      expect(result.fieldErrors?.password).toBe("A senha precisa ter pelo menos 8 caracteres.");
    });

    it("link inválido volta para a página do link (que mostra o aviso)", async () => {
      await expect(
        actions.resetPasswordAction(
          {},
          form({ token: "lixo", password: "nova-senha-123", confirmPassword: "nova-senha-123" }),
        ),
      ).rejects.toThrow("NEXT_REDIRECT:/recuperar-senha/lixo");
    });
  });
});
