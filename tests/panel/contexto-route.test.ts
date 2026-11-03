import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/types";
import { createSession } from "@/server/auth/session";
import { endSupport, startSupport } from "@/server/platform/support";
import { createTestDb } from "../helpers/test-db";
import { seedPlatformTenant, seedSuperAdmin } from "../helpers/platform-fixtures";

const state = vi.hoisted(() => ({ db: undefined as unknown, token: undefined as string | undefined }));
vi.mock("@/db/client", () => ({ getDb: async () => state.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "ea_session" && state.token ? { value: state.token } : undefined),
  }),
}));

describe("GET /api/painel/contexto", () => {
  let db: Db;
  beforeEach(async () => {
    vi.resetModules();
    db = await createTestDb();
    state.db = db;
    state.token = undefined;
  });

  const call = async () => (await import("@/app/api/painel/contexto/route")).GET();

  it("sem sessão: 401", async () => {
    const response = await call();
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("super-admin em suporte: devolve o estabelecimento atendido e support=true", async () => {
    const admin = await seedSuperAdmin(db);
    const { tenant } = await seedPlatformTenant(db);
    state.token = await createSession(db, admin.id, null);
    await startSupport(db, state.token, { userId: admin.id }, tenant.id);
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, tenantId: tenant.id, support: true });
  });

  it("trocar de estabelecimento em outra aba muda a resposta (é isso que o painel detecta)", async () => {
    const admin = await seedSuperAdmin(db);
    const first = await seedPlatformTenant(db, { name: "Studio A" });
    const second = await seedPlatformTenant(db, { name: "Studio B" });
    state.token = await createSession(db, admin.id, null);
    await startSupport(db, state.token, { userId: admin.id }, first.tenant.id);
    expect((await (await call()).json()).tenantId).toBe(first.tenant.id);
    await startSupport(db, state.token, { userId: admin.id }, second.tenant.id);
    expect((await (await call()).json()).tenantId).toBe(second.tenant.id);
  });

  it("depois de voltar à plataforma o super-admin sem estabelecimento próprio recebe 401", async () => {
    const admin = await seedSuperAdmin(db);
    const { tenant } = await seedPlatformTenant(db);
    state.token = await createSession(db, admin.id, null);
    await startSupport(db, state.token, { userId: admin.id }, tenant.id);
    await endSupport(db, state.token, { userId: admin.id });
    expect((await call()).status).toBe(401);
  });

  it("dono comum: devolve o próprio estabelecimento com support=false", async () => {
    const { tenant, owner } = await seedPlatformTenant(db);
    state.token = await createSession(db, owner.id, tenant.id);
    expect(await (await call()).json()).toEqual({ ok: true, tenantId: tenant.id, support: false });
  });
});
