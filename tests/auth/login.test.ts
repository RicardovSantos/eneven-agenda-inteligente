import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { memberships, sessions, tenants, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { login, resolveLoginTenantId } from "@/server/auth/login";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import {
  createSession,
  destroySession,
  getSession,
  hashToken,
} from "@/server/auth/session";
import { signup } from "@/server/auth/signup";
import { createTestDb } from "../helpers/test-db";

describe("password", () => {
  it("gera hash argon2id e verifica", async () => {
    const hash = await hashPassword("senha-forte-1");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "senha-forte-1")).toBe(true);
    expect(await verifyPassword(hash, "errada")).toBe(false);
    expect(await verifyPassword("lixo", "senha-forte-1")).toBe(false);
  });
});

describe("login e sessão", () => {
  let db: Db;
  let r: { userId: string; tenantId: string; slug: string };

  beforeEach(async () => {
    db = await createTestDb();
    r = await signup(db, {
      businessName: "Defendi Studio",
      ownerName: "Ana",
      email: "ana@defendi.com",
      password: "senha-forte-1",
      whatsapp: "11999999999",
    });
  });

  it("login ok ignora caixa e espaços no e-mail", async () => {
    expect(await login(db, "ANA@defendi.com", "senha-forte-1")).toEqual({ userId: r.userId });
    expect(await login(db, "  ana@defendi.com ", "senha-forte-1")).toEqual({ userId: r.userId });
  });

  it("retorna null para senha errada ou usuário inexistente", async () => {
    expect(await login(db, "ana@defendi.com", "errada")).toBeNull();
    expect(await login(db, "ninguem@defendi.com", "senha-forte-1")).toBeNull();
  });

  it("resolve o tenant do login: um vínculo → tenant; nenhum → null", async () => {
    expect(await resolveLoginTenantId(db, r.userId)).toBe(r.tenantId);
    const [admin] = await db
      .insert(users)
      .values({ email: "root@eneven.com", passwordHash: "x", name: "Root", isSuperAdmin: true })
      .returning();
    expect(await resolveLoginTenantId(db, admin.id)).toBeNull();
  });

  it("cria sessão, grava só o hash do token e devolve o papel", async () => {
    const token = await createSession(db, r.userId, r.tenantId);
    expect(token.length).toBeGreaterThanOrEqual(43);
    const rows = await db.select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(hashToken(token));
    expect(rows[0].id).not.toBe(token);

    expect(await getSession(db, token)).toEqual({
      userId: r.userId,
      tenantId: r.tenantId,
      role: "owner",
      isSuperAdmin: false,
      emailVerified: false,
    });
  });

  it("sessão vale 30 dias", async () => {
    const before = Date.now();
    const token = await createSession(db, r.userId, r.tenantId);
    const [row] = await db.select().from(sessions).where(eq(sessions.id, hashToken(token)));
    const days = (row.expiresAt.getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThan(29.99);
    expect(days).toBeLessThan(30.01);
  });

  it("emailVerified reflete email_verified_at", async () => {
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, r.userId));
    const token = await createSession(db, r.userId, r.tenantId);
    expect((await getSession(db, token))?.emailVerified).toBe(true);
  });

  it("token desconhecido ou vazio → null", async () => {
    expect(await getSession(db, "token-que-nao-existe")).toBeNull();
    expect(await getSession(db, "")).toBeNull();
  });

  it("sessão vencida → null", async () => {
    const token = await createSession(db, r.userId, r.tenantId);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, hashToken(token)));
    expect(await getSession(db, token)).toBeNull();
  });

  it("usuário sem membership no tenant da sessão → role null", async () => {
    const token = await createSession(db, r.userId, r.tenantId);
    await db.delete(memberships).where(eq(memberships.userId, r.userId));
    const info = await getSession(db, token);
    expect(info?.userId).toBe(r.userId);
    expect(info?.role).toBeNull();
  });

  it("não usa o papel de outro tenant", async () => {
    const [other] = await db
      .insert(tenants)
      .values({ slug: "outro", name: "Outro", trialEndsAt: new Date() })
      .returning();
    const token = await createSession(db, r.userId, other.id);
    expect((await getSession(db, token))?.role).toBeNull();
  });

  it("sessão sem tenant (super-admin) → tenantId e role null", async () => {
    const token = await createSession(db, r.userId, null);
    const info = await getSession(db, token);
    expect(info?.tenantId).toBeNull();
    expect(info?.role).toBeNull();
  });

  it("destroySession remove a sessão", async () => {
    const token = await createSession(db, r.userId, r.tenantId);
    await destroySession(db, token);
    expect(await getSession(db, token)).toBeNull();
    expect(await db.select().from(sessions)).toHaveLength(0);
  });
});
