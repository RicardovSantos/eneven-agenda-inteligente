import { beforeEach, describe, expect, it, vi } from "vitest";
import { memberships, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { createSession } from "@/server/auth/session";
import { createCharge } from "@/server/billing/charges";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

const state = vi.hoisted(() => ({ db: undefined as unknown, token: undefined as string | undefined }));
vi.mock("@/db/client", () => ({ getDb: async () => state.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "ea_session" && state.token ? { value: state.token } : undefined),
  }),
}));

describe("GET /api/painel/cobranca/status", () => {
  let db: Db;
  let tenant: Awaited<ReturnType<typeof seedTenant>>;
  let chargeId: string;
  let ownerId: string;

  beforeEach(async () => {
    vi.resetModules();
    db = await createTestDb();
    state.db = db;
    state.token = undefined;
    tenant = await seedTenant(db);
    const [owner] = await db.insert(users).values({ name: "Dona", email: `d${Math.random()}@example.com`, emailVerifiedAt: new Date() }).returning();
    ownerId = owner.id;
    await db.insert(memberships).values({ tenantId: tenant.id, userId: owner.id, role: "owner" });
    const create = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      return Response.json({
        id: 5550001, status: "pending", external_reference: body.external_reference, collector_id: 42, live_mode: false, currency_id: "BRL",
        transaction_amount: body.transaction_amount, date_last_updated: "2030-01-01T00:00:00Z",
        point_of_interaction: { transaction_data: { qr_code: "00020126PIXCOPIAECOLA", qr_code_base64: "iVBORw0KGgo=" } },
      });
    });
    ({ id: chargeId } = await createCharge(db, { tenantId: tenant.id, ownerUserId: owner.id, method: "pix" }, { accessToken: "TEST-example", collectorId: "42", fetcher: create }));
  });

  const call = async (id: string) => (await import("@/app/api/painel/cobranca/status/route")).GET(new Request(`http://localhost/api/painel/cobranca/status?id=${id}`));

  it("sem sessão: 401 e sem cache", async () => {
    const response = await call(chargeId);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("quem não é dono (recepção ou profissional): 401", async () => {
    for (const role of ["reception", "staff"] as const) {
      const [member] = await db.insert(users).values({ name: role, email: `${role}${Math.random()}@example.com`, emailVerifiedAt: new Date() }).returning();
      await db.insert(memberships).values({ tenantId: tenant.id, userId: member.id, role });
      state.token = await createSession(db, member.id, tenant.id);
      expect((await call(chargeId)).status).toBe(401);
    }
  });

  it("dono: devolve a situação da própria cobrança", async () => {
    state.token = await createSession(db, ownerId, tenant.id);
    const response = await call(chargeId);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ok: true, state: "pending", method: "pix" });
  });

  it("dono de outro estabelecimento não enxerga a cobrança alheia", async () => {
    const otherTenant = await seedTenant(db);
    const [other] = await db.insert(users).values({ name: "Outra", email: `o${Math.random()}@example.com`, emailVerifiedAt: new Date() }).returning();
    await db.insert(memberships).values({ tenantId: otherTenant.id, userId: other.id, role: "owner" });
    state.token = await createSession(db, other.id, otherTenant.id);
    expect(await (await call(chargeId)).json()).toEqual({ ok: true, state: "none" });
  });

  it("id ausente ou inválido: 'none', sem erro", async () => {
    state.token = await createSession(db, ownerId, tenant.id);
    expect(await (await call("")).json()).toEqual({ ok: true, state: "none" });
    expect(await (await call("../../etc")).json()).toEqual({ ok: true, state: "none" });
  });
});
