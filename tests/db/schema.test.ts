import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { memberships, sessions, tenants, users } from "@/db/schema";
import { createTestDb } from "../helpers/test-db";

const trialEndsAt = () => new Date(Date.now() + 86_400_000);

/** Código SQLSTATE 23505 = unique_violation (o erro vem em `cause`). */
async function expectUniqueViolation(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e as { cause?: { code?: string } },
  );
  expect(error?.cause?.code).toBe("23505");
}

describe("schema", () => {
  it("rejeita dois usuários com o mesmo e-mail", async () => {
    const db = await createTestDb();
    const row = { email: "ana@exemplo.com", passwordHash: "hash", name: "Ana" };
    await db.insert(users).values(row);
    await expectUniqueViolation(db.insert(users).values(row));
  });

  it("rejeita dois estabelecimentos com o mesmo slug", async () => {
    const db = await createTestDb();
    const row = { slug: "loja", name: "Loja", trialEndsAt: trialEndsAt() };
    await db.insert(tenants).values(row);
    await expectUniqueViolation(db.insert(tenants).values(row));
  });

  it("rejeita e-mail com letras maiúsculas", async () => {
    const db = await createTestDb();
    await expect(
      db
        .insert(users)
        .values({ email: "Ana@Exemplo.com", passwordHash: "h", name: "Ana" }),
    ).rejects.toThrow();
  });

  it("aplica os valores padrão de estabelecimento", async () => {
    const db = await createTestDb();
    const [tenant] = await db
      .insert(tenants)
      .values({ slug: "loja", name: "Loja", trialEndsAt: trialEndsAt() })
      .returning();
    expect(tenant.status).toBe("trial");
    expect(tenant.timezone).toBe("America/Sao_Paulo");
    expect(tenant.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(tenant.createdAt).toBeInstanceOf(Date);
  });

  it("remove vínculos e sessões em cascata ao apagar o estabelecimento", async () => {
    const db = await createTestDb();
    const [tenant] = await db
      .insert(tenants)
      .values({ slug: "loja", name: "Loja", trialEndsAt: trialEndsAt() })
      .returning();
    const [user] = await db
      .insert(users)
      .values({ email: "ana@exemplo.com", passwordHash: "h", name: "Ana" })
      .returning();
    await db
      .insert(memberships)
      .values({ userId: user.id, tenantId: tenant.id, role: "owner" });
    await db.insert(sessions).values({
      id: "hash-1",
      userId: user.id,
      tenantId: tenant.id,
      expiresAt: trialEndsAt(),
    });

    await db.delete(tenants).where(eq(tenants.id, tenant.id));

    expect(await db.select().from(memberships)).toHaveLength(0);
    expect(await db.select().from(sessions)).toHaveLength(0);
  });
});
