import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { emailTokens, sessions, users } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  checkEmailToken,
  consumeEmailToken,
  issueEmailToken,
  resetPassword,
  verifyEmail,
} from "@/server/auth/email-tokens";
import { login } from "@/server/auth/login";
import { createSession, getSession, hashToken } from "@/server/auth/session";
import { signup } from "@/server/auth/signup";
import { createTestDb } from "../helpers/test-db";

const HOUR = 3_600_000;
const addHours = (date: Date, hours: number) => new Date(date.getTime() + hours * HOUR);

describe("tokens de e-mail", () => {
  let db: Db;
  let userId: string;
  let tenantId: string;
  const now = new Date("2026-10-24T12:00:00Z");

  beforeEach(async () => {
    db = await createTestDb();
    const account = await signup(db, {
      businessName: "Defendi Studio",
      ownerName: "Ana",
      email: "ana@defendi.com",
      password: "senha-forte-1",
      whatsapp: "11999999999",
    });
    userId = account.userId;
    tenantId = account.tenantId;
  });

  it("emite, consome uma vez e depois diz 'used'", async () => {
    const t = await issueEmailToken(db, userId, "verify", now);
    expect(await consumeEmailToken(db, t, "verify", now)).toEqual({ ok: true, userId });
    expect(await consumeEmailToken(db, t, "verify", now)).toEqual({ ok: false, reason: "used" });
  });

  it("vencido: verify vale 48 h, reset vale 1 h", async () => {
    const t = await issueEmailToken(db, userId, "verify", now);
    expect(await consumeEmailToken(db, t, "verify", addHours(now, 47))).toEqual({ ok: true, userId });

    const t2 = await issueEmailToken(db, userId, "verify", now);
    expect(await consumeEmailToken(db, t2, "verify", addHours(now, 49))).toEqual({
      ok: false,
      reason: "expired",
    });

    const r1 = await issueEmailToken(db, userId, "reset", now);
    expect(await consumeEmailToken(db, r1, "reset", new Date(now.getTime() + 59 * 60_000))).toEqual({
      ok: true,
      userId,
    });
    const r2 = await issueEmailToken(db, userId, "reset", now);
    expect(await consumeEmailToken(db, r2, "reset", addHours(now, 2))).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("token desconhecido ou vazio → invalid", async () => {
    expect(await consumeEmailToken(db, "lixo", "verify", now)).toEqual({ ok: false, reason: "invalid" });
    expect(await consumeEmailToken(db, "", "verify", now)).toEqual({ ok: false, reason: "invalid" });
  });

  it("token de reset não serve para verify (e vice-versa) e não é consumido", async () => {
    const reset = await issueEmailToken(db, userId, "reset", now);
    expect(await consumeEmailToken(db, reset, "verify", now)).toEqual({ ok: false, reason: "invalid" });
    expect(await consumeEmailToken(db, reset, "reset", now)).toEqual({ ok: true, userId });

    const verify = await issueEmailToken(db, userId, "verify", now);
    expect(await consumeEmailToken(db, verify, "reset", now)).toEqual({ ok: false, reason: "invalid" });
  });

  it("grava só o hash do token, com a validade certa", async () => {
    const t = await issueEmailToken(db, userId, "verify", now);
    const [row] = await db.select().from(emailTokens).where(eq(emailTokens.userId, userId));
    expect(row.id).toBe(hashToken(t));
    expect(row.id).not.toBe(t);
    expect(row.purpose).toBe("verify");
    expect(row.usedAt).toBeNull();
    expect(row.expiresAt.toISOString()).toBe(addHours(now, 48).toISOString());
    expect(t.length).toBeGreaterThanOrEqual(43);
  });

  it("checkEmailToken confere sem consumir", async () => {
    const t = await issueEmailToken(db, userId, "reset", now);
    expect(await checkEmailToken(db, t, "reset", now)).toEqual({ ok: true, userId });
    expect(await checkEmailToken(db, t, "reset", now)).toEqual({ ok: true, userId });
    expect(await checkEmailToken(db, t, "reset", addHours(now, 2))).toEqual({ ok: false, reason: "expired" });
    expect(await checkEmailToken(db, "lixo", "reset", now)).toEqual({ ok: false, reason: "invalid" });
    await consumeEmailToken(db, t, "reset", now);
    expect(await checkEmailToken(db, t, "reset", now)).toEqual({ ok: false, reason: "used" });
  });

  describe("verifyEmail", () => {
    it("marca users.emailVerifiedAt", async () => {
      const t = await issueEmailToken(db, userId, "verify", now);
      expect(await verifyEmail(db, t, now)).toEqual({ ok: true, userId });
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      expect(user.emailVerifiedAt?.toISOString()).toBe(now.toISOString());
    });

    it("link repetido → used, e não muda a data da confirmação", async () => {
      const t = await issueEmailToken(db, userId, "verify", now);
      await verifyEmail(db, t, now);
      expect(await verifyEmail(db, t, addHours(now, 1))).toEqual({ ok: false, reason: "used" });
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      expect(user.emailVerifiedAt?.toISOString()).toBe(now.toISOString());
    });

    it("token vencido ou inválido não confirma", async () => {
      const t = await issueEmailToken(db, userId, "verify", now);
      expect(await verifyEmail(db, t, addHours(now, 49))).toEqual({ ok: false, reason: "expired" });
      expect(await verifyEmail(db, "lixo", now)).toEqual({ ok: false, reason: "invalid" });
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      expect(user.emailVerifiedAt).toBeNull();
    });

    it("token de reset não confirma o e-mail", async () => {
      const t = await issueEmailToken(db, userId, "reset", now);
      expect(await verifyEmail(db, t, now)).toEqual({ ok: false, reason: "invalid" });
    });
  });

  describe("resetPassword", () => {
    it("troca a senha e apaga TODAS as sessões do usuário", async () => {
      const s1 = await createSession(db, userId, tenantId);
      const s2 = await createSession(db, userId, tenantId);
      const other = await signup(db, {
        businessName: "Outro Studio",
        ownerName: "Bia",
        email: "bia@outro.com",
        password: "outra-senha-1",
        whatsapp: "11988888888",
      });
      const otherSession = await createSession(db, other.userId, other.tenantId);

      const t = await issueEmailToken(db, userId, "reset", now);
      expect(await resetPassword(db, t, "nova-senha-123", now)).toEqual({ ok: true, userId });

      expect(await getSession(db, s1)).toBeNull();
      expect(await getSession(db, s2)).toBeNull();
      expect(await getSession(db, otherSession)).not.toBeNull();
      expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);

      expect(await login(db, "ana@defendi.com", "nova-senha-123")).toEqual({ userId });
      expect(await login(db, "ana@defendi.com", "senha-forte-1")).toBeNull();
    });

    it("link só vale uma vez", async () => {
      const t = await issueEmailToken(db, userId, "reset", now);
      await resetPassword(db, t, "nova-senha-123", now);
      expect(await resetPassword(db, t, "outra-senha-456", now)).toEqual({ ok: false, reason: "used" });
      expect(await login(db, "ana@defendi.com", "nova-senha-123")).toEqual({ userId });
    });

    it("vencido ou inválido não troca a senha nem apaga sessões", async () => {
      const session = await createSession(db, userId, tenantId);
      const t = await issueEmailToken(db, userId, "reset", now);
      expect(await resetPassword(db, t, "nova-senha-123", addHours(now, 2))).toEqual({
        ok: false,
        reason: "expired",
      });
      expect(await resetPassword(db, "lixo", "nova-senha-123", now)).toEqual({
        ok: false,
        reason: "invalid",
      });
      expect(await login(db, "ana@defendi.com", "senha-forte-1")).toEqual({ userId });
      expect(await getSession(db, session)).not.toBeNull();
    });

    it("senha curta é recusada sem gastar o link", async () => {
      const t = await issueEmailToken(db, userId, "reset", now);
      await expect(resetPassword(db, t, "curta", now)).rejects.toThrow();
      expect(await checkEmailToken(db, t, "reset", now)).toEqual({ ok: true, userId });
    });

    it("token de verify não redefine senha", async () => {
      const t = await issueEmailToken(db, userId, "verify", now);
      expect(await resetPassword(db, t, "nova-senha-123", now)).toEqual({ ok: false, reason: "invalid" });
    });
  });
});
