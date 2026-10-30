import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { bookings, memberships, users } from "@/db/schema";
import { exportTenantAgenda } from "@/server/export/agenda";
import { seedBooking, seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

const state = vi.hoisted(() => ({ db: undefined as unknown, session: undefined as unknown }));
vi.mock("@/db/client", () => ({ getDb: async () => state.db }));
vi.mock("@/server/auth/guard", () => ({ getCurrentSession: async () => state.session }));
import { GET } from "@/app/api/painel/exportar-agenda/route";

it("exporta apenas os dados do dono, sem tokens ou dados de outro estabelecimento", async () => {
  const db = await createTestDb(); state.db = db;
  const a = await seedTenant(db); const b = await seedTenant(db);
  const [owner] = await db.insert(users).values({ name: "Dona", email: "owner@example.com" }).returning();
  await db.insert(memberships).values({ userId: owner.id, tenantId: a.id, role: "owner" });
  const bookingA = await seedBooking(db, a.id);
  await seedBooking(db, b.id);
  await db.update(bookings).set({ manageTokenHash: "segredo-nao-exportar" }).where(eq(bookings.id, bookingA.id));
  const data = await exportTenantAgenda(db, { userId: owner.id, tenantId: a.id });
  expect(data.bookings).toHaveLength(1);
  expect(data.bookings[0].id).toBe(bookingA.id);
  expect(JSON.stringify(data)).not.toContain("segredo-nao-exportar");
  await expect(exportTenantAgenda(db, { userId: owner.id, tenantId: b.id })).rejects.toThrow("Acesso indisponível");
  state.session = { userId: owner.id, tenantId: a.id, role: "staff", support: false };
  expect((await GET()).status).toBe(403);
  state.session = { userId: owner.id, tenantId: a.id, role: "owner", support: true };
  expect((await GET()).status).toBe(403);
  state.session = { userId: owner.id, tenantId: a.id, role: "owner", support: false };
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("content-disposition")).toContain("attachment");
});
