import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { users } from "@/db/schema";
import { promoteSuperAdmin } from "@/server/platform/super-admin";
import { createTestDb } from "../helpers/test-db";
import { seedPlatformTenant } from "../helpers/platform-fixtures";

describe("promoteSuperAdmin (--promote)", () => {
  it("marca um usuário existente como super-admin, sem mexer na senha", async () => {
    const db = await createTestDb();
    const { owner } = await seedPlatformTenant(db, { ownerEmail: "ricardo@eneven.com" });
    const result = await promoteSuperAdmin(db, "  Ricardo@Eneven.com ");
    expect(result).toEqual({ email: "ricardo@eneven.com", alreadySuperAdmin: false });
    const [u] = await db.select().from(users).where(eq(users.id, owner.id));
    expect(u.isSuperAdmin).toBe(true);
    expect(u.passwordHash).toBe("x");
    expect((await promoteSuperAdmin(db, "ricardo@eneven.com")).alreadySuperAdmin).toBe(true);
  });

  it("usuário inexistente ou e-mail inválido -> erro claro", async () => {
    const db = await createTestDb();
    await expect(promoteSuperAdmin(db, "ninguem@exemplo.com")).rejects.toThrow(
      "Não existe usuário com o e-mail ninguem@exemplo.com. Crie a conta antes (cadastro ou create-super-admin).",
    );
    await expect(promoteSuperAdmin(db, "nao-e-email")).rejects.toThrow("E-mail inválido");
  });
});
