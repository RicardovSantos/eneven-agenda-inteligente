import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emailTokens, users } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  RESEND_COOLDOWN_SECONDS,
  requestPasswordReset,
  sendVerificationEmail,
} from "@/server/auth/email-flows";
import { consumeEmailToken } from "@/server/auth/email-tokens";
import { signup } from "@/server/auth/signup";
import { sendEmail } from "@/server/email/send";
import { createTestDb } from "../helpers/test-db";

vi.mock("@/server/email/send", () => ({ sendEmail: vi.fn(async () => {}) }));
const sendEmailMock = vi.mocked(sendEmail);

const seconds = (date: Date, s: number) => new Date(date.getTime() + s * 1000);
const tokenFromLink = (text: string) => {
  const match = text.match(/(?:token=|recuperar-senha\/)([\w-]+)/);
  if (!match) throw new Error("link sem token no e-mail");
  return match[1];
};

describe("fluxos de e-mail", () => {
  let db: Db;
  let userId: string;
  const now = new Date("2026-10-24T12:00:00Z");

  beforeEach(async () => {
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue(undefined);
    db = await createTestDb();
    const account = await signup(db, {
      businessName: "Defendi Studio",
      ownerName: "Ana Souza",
      email: "ana@defendi.com",
      password: "senha-forte-1",
      whatsapp: "11999999999",
    });
    userId = account.userId;
  });

  describe("sendVerificationEmail", () => {
    it("envia o e-mail de confirmação com o link do token", async () => {
      const result = await sendVerificationEmail(db, userId, now);

      expect(result).toEqual({ status: "sent", email: "ana@defendi.com" });
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      const mail = sendEmailMock.mock.calls[0][0];
      expect(mail.to).toBe("ana@defendi.com");
      expect(mail.subject).toBe("Confirme seu e-mail na Eneven Agenda");
      expect(mail.html).toContain("Olá, Ana. Confirme seu e-mail");
      expect(mail.html).toContain("Defendi Studio");
      const token = tokenFromLink(mail.text ?? "");
      expect(await consumeEmailToken(db, token, "verify", now)).toEqual({ ok: true, userId });
    });

    it("limita a 1 reenvio por 60 s por usuário", async () => {
      expect((await sendVerificationEmail(db, userId, now)).status).toBe("sent");
      expect(await sendVerificationEmail(db, userId, seconds(now, 30))).toEqual({
        status: "cooldown",
      });
      expect(await sendVerificationEmail(db, userId, seconds(now, RESEND_COOLDOWN_SECONDS - 1))).toEqual({
        status: "cooldown",
      });
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect((await sendVerificationEmail(db, userId, seconds(now, RESEND_COOLDOWN_SECONDS))).status).toBe(
        "sent",
      );
      expect(sendEmailMock).toHaveBeenCalledTimes(2);
    });

    it("novo envio invalida o link anterior que ainda não foi usado", async () => {
      await sendVerificationEmail(db, userId, now);
      const first = tokenFromLink(sendEmailMock.mock.calls[0][0].text ?? "");
      const later = seconds(now, 120);
      await sendVerificationEmail(db, userId, later);
      const second = tokenFromLink(sendEmailMock.mock.calls[1][0].text ?? "");

      expect(second).not.toBe(first);
      expect(await consumeEmailToken(db, first, "verify", later)).toEqual({ ok: false, reason: "invalid" });
      expect(await consumeEmailToken(db, second, "verify", later)).toEqual({ ok: true, userId });
    });

    it("não envia se o e-mail já foi confirmado, nem para usuário inexistente", async () => {
      await db.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, userId));
      expect(await sendVerificationEmail(db, userId, now)).toEqual({ status: "already_verified" });
      expect(
        await sendVerificationEmail(db, "00000000-0000-4000-8000-000000000000", now),
      ).toEqual({ status: "not_found" });
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("pedidos simultâneos do mesmo usuário: só um envio e um token", async () => {
      const results = await Promise.all(
        Array.from({ length: 6 }, () => sendVerificationEmail(db, userId, now)),
      );
      expect(results.filter((r) => r.status === "sent")).toHaveLength(1);
      expect(results.filter((r) => r.status === "cooldown")).toHaveLength(5);
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect(
        await db.select().from(emailTokens).where(eq(emailTokens.userId, userId)),
      ).toHaveLength(1);
    });

    it("se o envio falha, a exceção sobe para quem chamou decidir", async () => {
      sendEmailMock.mockRejectedValueOnce(new Error("ZeptoMail 500"));
      await expect(sendVerificationEmail(db, userId, now)).rejects.toThrow("ZeptoMail 500");
    });
  });

  describe("requestPasswordReset", () => {
    it("e-mail existente: envia o link de redefinição (e-mail normalizado)", async () => {
      await requestPasswordReset(db, "  ANA@defendi.com ", now);

      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      const mail = sendEmailMock.mock.calls[0][0];
      expect(mail.to).toBe("ana@defendi.com");
      expect(mail.subject).toBe("Redefinir sua senha da Eneven Agenda");
      const token = tokenFromLink(mail.text ?? "");
      expect(await consumeEmailToken(db, token, "reset", now)).toEqual({ ok: true, userId });
    });

    it("e-mail inexistente: não envia nem grava nada", async () => {
      await requestPasswordReset(db, "ninguem@defendi.com", now);
      expect(sendEmailMock).not.toHaveBeenCalled();
      expect(await db.select().from(emailTokens)).toHaveLength(0);
    });

    it("pedidos seguidos (< 60 s) enviam só um e-mail", async () => {
      await requestPasswordReset(db, "ana@defendi.com", now);
      await requestPasswordReset(db, "ana@defendi.com", seconds(now, 10));
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      await requestPasswordReset(db, "ana@defendi.com", seconds(now, 90));
      expect(sendEmailMock).toHaveBeenCalledTimes(2);
    });

    it("novo pedido invalida o link de redefinição anterior", async () => {
      await requestPasswordReset(db, "ana@defendi.com", now);
      const first = tokenFromLink(sendEmailMock.mock.calls[0][0].text ?? "");
      const later = seconds(now, 120);
      await requestPasswordReset(db, "ana@defendi.com", later);
      expect(await consumeEmailToken(db, first, "reset", later)).toEqual({ ok: false, reason: "invalid" });
    });

    it("pedidos simultâneos (spam num e-mail) geram um único e-mail e um único token", async () => {
      await Promise.all(
        Array.from({ length: 6 }, () => requestPasswordReset(db, "ana@defendi.com", now)),
      );
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect(
        await db.select().from(emailTokens).where(eq(emailTokens.userId, userId)),
      ).toHaveLength(1);
    });

    it("falha no envio é registrada, não lançada (não revela a conta)", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      sendEmailMock.mockRejectedValueOnce(new Error("ZeptoMail 500"));
      await expect(requestPasswordReset(db, "ana@defendi.com", now)).resolves.toBeUndefined();
      expect(log).toHaveBeenCalled();
      log.mockRestore();
    });
  });
});
