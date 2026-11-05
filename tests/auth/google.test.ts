import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  auditLog,
  emailTokens,
  memberships,
  oauthAccounts,
  sessions,
  tenants,
  users,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { AuthError } from "@/server/auth/errors";
import {
  GOOGLE_PENDING_PURPOSE,
  completeGoogleSignup,
  parseGoogleClaims,
  parsePendingProfile,
  publicBaseUrl,
  resolveGoogleUser,
  type GoogleProfile,
} from "@/server/auth/google";
import { login, resolveLoginTenantId } from "@/server/auth/login";
import { issueEmailToken } from "@/server/auth/email-tokens";
import { hashPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { signValue } from "@/server/auth/signed-cookie";
import { signup } from "@/server/auth/signup";
import { createTestDb } from "../helpers/test-db";

const newProfile: GoogleProfile = {
  sub: "google-sub-123",
  email: "bia@gmail.com",
  emailVerified: true,
  name: "Bia Lima",
  picture: "https://lh3.googleusercontent.com/a/bia",
};

describe("resolveGoogleUser", () => {
  let db: Db;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDb();
    ({ userId } = await signup(db, {
      businessName: "Defendi Studio",
      ownerName: "Ana",
      email: "ana@defendi.com",
      password: "senha-forte-1",
      whatsapp: "11999999999",
    }));
  });

  it("e-mail desconhecido e verificado: usuário novo", async () => {
    expect(await resolveGoogleUser(db, newProfile)).toEqual({ kind: "new" });
  });

  it("e-mail verificado de usuário com senha: vincula, confirma o e-mail e acha de novo pelo sub", async () => {
    const profile = { ...newProfile, sub: "sub-ana", email: "Ana@Defendi.com" };
    expect(await resolveGoogleUser(db, profile)).toEqual({ kind: "existing", userId });

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    // conta nunca confirmada: a senha antiga é descartada (detalhes no bloco R19)
    expect(user.passwordHash).toBeNull();
    const links = await db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, userId));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      provider: "google",
      providerUserId: "sub-ana",
      email: "ana@defendi.com",
    });

    // pelo sub, mesmo que o e-mail do Google mude
    expect(await resolveGoogleUser(db, { ...profile, email: "outro@gmail.com" })).toEqual({
      kind: "existing",
      userId,
    });
    expect(await db.select().from(oauthAccounts)).toHaveLength(1);
  });

  describe("proteção contra pré-sequestro (R19)", () => {
    let tenantId: string;
    const profile = { ...newProfile, sub: "sub-ana", email: "ana@defendi.com" };
    const now = new Date("2026-10-24T12:00:00Z");

    beforeEach(async () => {
      [{ tenantId }] = await db
        .select({ tenantId: memberships.tenantId })
        .from(memberships)
        .where(eq(memberships.userId, userId));
    });

    it("conta com senha nunca confirmada: zera a senha, derruba sessões e links, confirma e registra", async () => {
      await createSession(db, userId, tenantId);
      await createSession(db, userId, tenantId);
      await issueEmailToken(db, userId, "verify", now);
      await issueEmailToken(db, userId, "reset", now);
      const [before] = await db.select().from(users).where(eq(users.id, userId));
      expect(before.emailVerifiedAt).toBeNull();
      expect(before.passwordHash).not.toBeNull();

      expect(await resolveGoogleUser(db, profile, now)).toEqual({ kind: "existing", userId });

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      expect(user.passwordHash).toBeNull();
      expect(user.emailVerifiedAt?.toISOString()).toBe(now.toISOString());
      expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);
      expect(
        await db.select().from(emailTokens).where(eq(emailTokens.userId, userId)),
      ).toHaveLength(0);
      expect(await login(db, "ana@defendi.com", "senha-forte-1")).toBeNull();
      expect(await db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, userId))).toHaveLength(1);

      const [entry] = await db.select().from(auditLog);
      expect(entry).toMatchObject({
        action: "google_link",
        actorUserId: userId,
        details: { clearedPassword: true },
      });

      // a pessoa ainda pode criar uma senha pelo "esqueci minha senha" (fluxo já existente)
      expect(await resolveGoogleUser(db, profile, now)).toEqual({ kind: "existing", userId });
      expect(await db.select().from(auditLog)).toHaveLength(1);
    });

    it("conta com e-mail já confirmado: mantém senha e sessões", async () => {
      await db.update(users).set({ emailVerifiedAt: new Date("2026-01-01T00:00:00Z") }).where(eq(users.id, userId));
      await createSession(db, userId, tenantId);

      expect(await resolveGoogleUser(db, profile, now)).toEqual({ kind: "existing", userId });

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      expect(user.passwordHash).not.toBeNull();
      expect(user.emailVerifiedAt?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
      expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(1);
      expect(await login(db, "ana@defendi.com", "senha-forte-1")).toEqual({ userId });
      const [entry] = await db.select().from(auditLog);
      expect(entry).toMatchObject({ action: "google_link", details: { clearedPassword: false } });
    });
  });

  it("não sobrescreve um emailVerifiedAt já preenchido", async () => {
    const earlier = new Date("2026-01-01T00:00:00Z");
    await db.update(users).set({ emailVerifiedAt: earlier }).where(eq(users.id, userId));
    await resolveGoogleUser(db, { ...newProfile, sub: "s", email: "ana@defendi.com" });
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(user.emailVerifiedAt?.toISOString()).toBe(earlier.toISOString());
  });

  it("e-mail não verificado no Google: erro, sem vincular", async () => {
    expect(
      await resolveGoogleUser(db, { ...newProfile, emailVerified: false, email: "ana@defendi.com" }),
    ).toEqual({ kind: "error", reason: "email_not_verified" });
    expect(await resolveGoogleUser(db, { ...newProfile, emailVerified: false })).toEqual({
      kind: "error",
      reason: "email_not_verified",
    });
    expect(await db.select().from(oauthAccounts)).toHaveLength(0);
  });
});

describe("completeGoogleSignup", () => {
  let db: Db;
  const now = new Date("2026-10-24T12:00:00Z");

  beforeEach(async () => {
    db = await createTestDb();
  });

  it("cria tenant em teste, usuário sem senha, membership owner e vínculo do Google", async () => {
    const r = await completeGoogleSignup(
      db,
      newProfile,
      { businessName: "Studio Bela", whatsapp: "(11) 98888-7777" },
      now,
    );
    expect(r.slug).toBe("studio-bela");

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, r.tenantId));
    expect(tenant.status).toBe("trial");
    expect(tenant.name).toBe("Studio Bela");
    expect(tenant.whatsapp).toBe("5511988887777");
    expect(tenant.trialEndsAt.toISOString()).toBe("2026-11-23T12:00:00.000Z");

    const [user] = await db.select().from(users).where(eq(users.id, r.userId));
    expect(user.passwordHash).toBeNull();
    expect(user.emailVerifiedAt?.toISOString()).toBe(now.toISOString());
    expect(user.name).toBe("Bia Lima");
    expect(user.email).toBe("bia@gmail.com");

    expect(await db.select().from(memberships).where(eq(memberships.userId, r.userId))).toEqual([
      { userId: r.userId, tenantId: r.tenantId, role: "owner" },
    ]);
    const [link] = await db.select().from(oauthAccounts);
    expect(link).toMatchObject({
      provider: "google",
      providerUserId: "google-sub-123",
      userId: r.userId,
      email: "bia@gmail.com",
    });

    // conta só-Google não entra por senha
    expect(await login(db, newProfile.email, "qualquer-senha")).toBeNull();
    // e depois disso o Google a reconhece
    expect(await resolveGoogleUser(db, newProfile)).toEqual({ kind: "existing", userId: r.userId });
    expect(await resolveLoginTenantId(db, r.userId)).toBe(r.tenantId);
  });

  it("valida estabelecimento e WhatsApp com mensagens em português", async () => {
    const error = await completeGoogleSignup(db, newProfile, {
      businessName: "  ",
      whatsapp: "123",
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).code).toBe("validation");
    expect((error as AuthError).fieldErrors).toEqual({
      businessName: "Informe o nome do estabelecimento.",
      whatsapp: "Informe um WhatsApp com DDD.",
    });
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("e-mail que já tem conta: AuthError email_taken e nada é gravado", async () => {
    await signup(db, {
      businessName: "Outro",
      ownerName: "Bia",
      email: "bia@gmail.com",
      password: "senha-forte-1",
      whatsapp: "11999999999",
    });
    const error = await completeGoogleSignup(db, newProfile, {
      businessName: "Studio Bela",
      whatsapp: "11988887777",
    }).catch((e: unknown) => e);
    expect((error as AuthError).code).toBe("email_taken");
    expect(await db.select().from(oauthAccounts)).toHaveLength(0);
    expect(await db.select().from(tenants)).toHaveLength(1);
  });

  it("escolhe outro slug quando o nome já existe", async () => {
    await signup(db, {
      businessName: "Studio Bela",
      ownerName: "X",
      email: "x@x.com",
      password: "senha-forte-1",
      whatsapp: "11999999999",
    });
    const r = await completeGoogleSignup(db, newProfile, {
      businessName: "Studio Bela",
      whatsapp: "11988887777",
    });
    expect(r.slug).not.toBe("studio-bela");
    expect(r.slug.startsWith("studio-bela")).toBe(true);
  });
});

describe("login de conta sem senha", () => {
  it("retorna null para usuário com passwordHash nulo, gastando o custo de um hash", async () => {
    const db = await createTestDb();
    await completeGoogleSignup(db, newProfile, {
      businessName: "Studio Bela",
      whatsapp: "11988887777",
    });
    await db.insert(users).values({
      email: "com-senha@x.com",
      name: "Com Senha",
      passwordHash: await hashPassword("senha-forte-1"),
    });

    await login(db, "naoexiste@x.com", "x"); // aquece o hash descartável
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    // Mediana de 5 execuções para não depender de um único pico de CPU no CI.
    const time = async (email: string) => {
      const samples: number[] = [];
      let result: unknown;
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        result = await login(db, email, "senha-errada-12");
        samples.push(performance.now() - t0);
      }
      return { result, ms: median(samples) };
    };
    const passwordless = await time(newProfile.email);
    const wrongPassword = await time("com-senha@x.com");
    expect(passwordless.result).toBeNull();
    expect(wrongPassword.result).toBeNull();
    // Mesma ordem de grandeza de uma senha errada de verdade (argon2 leva dezenas de ms).
    expect(passwordless.ms).toBeGreaterThan(wrongPassword.ms * 0.3);
  });
});

describe("parseGoogleClaims", () => {
  const base = { sub: "1", email: "A@B.com", name: "Ana", picture: "https://x/y.png" };

  it("aceita email_verified booleano ou texto", () => {
    expect(parseGoogleClaims({ ...base, email_verified: true })).toEqual({
      sub: "1",
      email: "a@b.com",
      emailVerified: true,
      name: "Ana",
      picture: "https://x/y.png",
    });
    expect(parseGoogleClaims({ ...base, email_verified: "true" })?.emailVerified).toBe(true);
    expect(parseGoogleClaims({ ...base, email_verified: "false" })?.emailVerified).toBe(false);
    expect(parseGoogleClaims({ ...base, email_verified: false })?.emailVerified).toBe(false);
    expect(parseGoogleClaims({ ...base })?.emailVerified).toBe(false);
  });

  it("usa o começo do e-mail quando não há nome e ignora foto que não é https", () => {
    const p = parseGoogleClaims({
      sub: "1",
      email: "ana@b.com",
      email_verified: true,
      picture: "javascript:x",
    });
    expect(p?.name).toBe("ana");
    expect(p?.picture).toBeNull();
  });

  it("sem sub ou e-mail válido: null", () => {
    expect(parseGoogleClaims({ email: "a@b.com" })).toBeNull();
    expect(parseGoogleClaims({ sub: "1" })).toBeNull();
    expect(parseGoogleClaims({ sub: "1", email: "nao-e-email" })).toBeNull();
  });
});

describe("parsePendingProfile", () => {
  it("lê o perfil de um cookie assinado válido", () => {
    expect(parsePendingProfile(signValue(newProfile, 900, GOOGLE_PENDING_PURPOSE))).toEqual(newProfile);
  });

  it("rejeita ausente, adulterado, vencido ou de formato errado", () => {
    expect(parsePendingProfile(undefined)).toBeNull();
    expect(parsePendingProfile("lixo")).toBeNull();
    expect(parsePendingProfile(signValue(newProfile, -1, GOOGLE_PENDING_PURPOSE))).toBeNull();
    expect(parsePendingProfile(signValue({ foo: 1 }, 900, GOOGLE_PENDING_PURPOSE))).toBeNull();
    expect(parsePendingProfile(signValue({ ...newProfile, emailVerified: false }, 900, GOOGLE_PENDING_PURPOSE))).toBeNull();
  });

  it("rejeita um valor assinado para outro propósito (HMAC prefixado)", () => {
    expect(parsePendingProfile(signValue(newProfile, 900, "ea_session"))).toBeNull();
  });
});

describe("publicBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("usa APP_URL (sem barra final) quando definido", () => {
    vi.stubEnv("APP_URL", "https://agenda.eneven.com.br/");
    expect(publicBaseUrl("http://interno:3000")).toBe("https://agenda.eneven.com.br");
  });

  it("em desenvolvimento sem APP_URL cai na origem da requisição", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_URL", "");
    expect(publicBaseUrl("http://localhost:3000/")).toBe("http://localhost:3000");
  });

  it("em produção exige APP_URL: nunca usa a origem da requisição (atrás do proxy é interna)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "");
    expect(() => publicBaseUrl("http://interno:3000")).toThrow(/APP_URL/);
  });
});
