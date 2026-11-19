import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tenants, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { SESSION_COOKIE } from "@/server/auth/session";
import { resetRateLimitsForTests } from "@/server/security/limits";
import { seedOwnerTenant } from "../helpers/team-fixtures";
import { createTestDb } from "../helpers/test-db";

const state = vi.hoisted(() => ({
  db: undefined as unknown,
  session: undefined as unknown,
  cookieSet: [] as unknown[][],
}));

vi.mock("@/db/client", () => ({ getDb: async () => state.db }));
vi.mock("@/server/auth/guard", () => ({ requireTenantSession: async () => state.session }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "ea_session" ? { value: "token-antigo" } : undefined),
    set: (...args: unknown[]) => state.cookieSet.push(args),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { deleteAccountAction } from "@/app/painel/conta/excluir/actions";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

describe("deleteAccountAction", () => {
  let db: Db;
  let tenantId: string;
  let userId: string;

  beforeEach(async () => {
    resetRateLimitsForTests();
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.cookieSet = [];
    db = await createTestDb();
    state.db = db;
    const t = await seedOwnerTenant(db, "Studio", "dona@studio.com");
    tenantId = t.tenantId;
    userId = t.userId;
    state.session = { userId, tenantId, role: "owner", isSuperAdmin: false, emailVerified: true, support: false };
  });

  it("senha errada devolve o erro e não apaga nem desloga", async () => {
    const result = await deleteAccountAction({}, form({ confirmation: "EXCLUIR", password: "errada" }));
    expect(result.error).toBe("Senha incorreta.");
    expect(state.cookieSet).toHaveLength(0);
    expect(await db.select().from(tenants).where(eq(tenants.id, tenantId))).toHaveLength(1);
  });

  it("modo suporte nunca exclui", async () => {
    state.session = { ...(state.session as object), support: true };
    const result = await deleteAccountAction({}, form({ confirmation: "EXCLUIR", password: "senha-forte-1" }));
    expect(result.error).toBe("Indisponível no modo suporte.");
    expect(await db.select().from(tenants).where(eq(tenants.id, tenantId))).toHaveLength(1);
  });

  it("limita as tentativas de senha", async () => {
    for (let i = 0; i < 5; i++) await deleteAccountAction({}, form({ confirmation: "EXCLUIR", password: "errada" }));
    const result = await deleteAccountAction({}, form({ confirmation: "EXCLUIR", password: "errada" }));
    expect(result.error).toMatch(/tente|aguarde|espere|minuto/i);
  });

  it("exclui, limpa o cookie de sessão e leva ao login com o aviso", async () => {
    await expect(deleteAccountAction({}, form({ confirmation: "EXCLUIR", password: "senha-forte-1" }))).rejects.toThrow("REDIRECT:/entrar?conta=excluida");
    expect(await db.select().from(tenants).where(eq(tenants.id, tenantId))).toHaveLength(0);
    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(0);
    expect(state.cookieSet[0]?.slice(0, 2)).toEqual([SESSION_COOKIE, ""]);
  });
});
