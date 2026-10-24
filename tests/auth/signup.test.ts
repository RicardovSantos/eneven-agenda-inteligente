import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { memberships, tenants, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { isUniqueViolation } from "@/server/db-errors";
import { verifyPassword } from "@/server/auth/password";
import { signup } from "@/server/auth/signup";
import { createTestDb } from "../helpers/test-db";

const input = {
  businessName: "Defendi Studio",
  ownerName: "Ana",
  email: " Ana@Defendi.com ",
  password: "senha-forte-1",
  whatsapp: "11999999999",
};

describe("signup", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it("cria tenant em trial, usuário e membership owner", async () => {
    const now = new Date("2026-10-24T12:00:00Z");
    const r = await signup(db, input, now);

    expect(r.slug).toBe("defendi-studio");

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, r.tenantId));
    expect(tenant.status).toBe("trial");
    expect(tenant.name).toBe("Defendi Studio");
    expect(tenant.trialEndsAt.toISOString()).toBe("2026-11-07T12:00:00.000Z");
    expect(tenant.whatsapp).toBe("5511999999999");

    const [user] = await db.select().from(users).where(eq(users.id, r.userId));
    expect(user.email).toBe("ana@defendi.com");
    expect(user.name).toBe("Ana");
    expect(user.isSuperAdmin).toBe(false);
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.passwordHash).not.toContain("senha-forte-1");
    expect(await verifyPassword(user.passwordHash!, "senha-forte-1")).toBe(true);

    const rows = await db.select().from(memberships).where(eq(memberships.userId, r.userId));
    expect(rows).toEqual([{ userId: r.userId, tenantId: r.tenantId, role: "owner" }]);
  });

  it("rejeita e-mail já usado (ignorando caixa) com mensagem em português", async () => {
    await signup(db, input);
    await expect(
      signup(db, { ...input, businessName: "Outro Estúdio", email: "ANA@defendi.com" }),
    ).rejects.toThrow(/já tem uma conta/i);
    expect(await db.select().from(tenants)).toHaveLength(1);
  });

  it("gera slug único quando o nome se repete", async () => {
    await signup(db, input);
    const r = await signup(db, { ...input, email: "bia@defendi.com" });
    expect(r.slug).toBe("defendi-studio-2");
  });

  it("valida a entrada: senha curta, e-mail inválido, WhatsApp sem DDD, nome vazio", async () => {
    await expect(signup(db, { ...input, password: "curta" })).rejects.toThrow(
      /pelo menos 8 caracteres/i,
    );
    await expect(signup(db, { ...input, email: "nao-e-email" })).rejects.toThrow(
      /e-mail válido/i,
    );
    await expect(signup(db, { ...input, whatsapp: "9999-9999" })).rejects.toThrow(
      /WhatsApp com DDD/i,
    );
    await expect(signup(db, { ...input, businessName: "   " })).rejects.toThrow(
      /nome do estabelecimento/i,
    );
    await expect(signup(db, { ...input, ownerName: "" })).rejects.toThrow(/seu nome/i);
    expect(await db.select().from(users)).toHaveLength(0);
    expect(await db.select().from(tenants)).toHaveLength(0);
  });
});

describe("isUniqueViolation", () => {
  it("reconhece violações reais de unicidade pelo nome da constraint", async () => {
    const db = await createTestDb();
    await signup(db, input);

    const slugError = await db
      .insert(tenants)
      .values({ slug: "defendi-studio", name: "x", trialEndsAt: new Date() })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(isUniqueViolation(slugError, "tenants_slug_unique")).toBe(true);
    expect(isUniqueViolation(slugError, "users_email_unique")).toBe(false);

    const emailError = await db
      .insert(users)
      .values({ email: "ana@defendi.com", passwordHash: "x", name: "x" })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(isUniqueViolation(emailError, "users_email_unique")).toBe(true);
    expect(isUniqueViolation(emailError, "tenants_slug_unique")).toBe(false);
  });

  it("ignora erros que não são de unicidade", () => {
    expect(isUniqueViolation(new Error("x"), "tenants_slug_unique")).toBe(false);
    expect(isUniqueViolation(null, "tenants_slug_unique")).toBe(false);
  });
});
