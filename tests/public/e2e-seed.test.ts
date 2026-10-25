import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/types";
import { getPublicTenant } from "@/server/public/tenant";
import { createTestDb } from "../helpers/test-db";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({ getDb: async () => state.db }));

import { POST } from "@/app/api/e2e/seed/route";
import { e2eSeedAllowed } from "@/server/e2e/seed";

let db: Db;

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
});
afterEach(() => vi.unstubAllEnvs());

const headers = (secret?: string) => new Headers(secret ? { "x-e2e-seed": secret } : {});
const call = (body: unknown, secret?: string) =>
  POST(
    new Request("http://localhost/api/e2e/seed", {
      method: "POST",
      headers: headers(secret),
      body: JSON.stringify(body),
    }),
  );

describe("rota de apoio do e2e", () => {
  it("fica desligada sem E2E_SEED, em produção ou com segredo errado", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_SEED", "");
    expect(e2eSeedAllowed(headers("qualquer"))).toBe(false);

    vi.stubEnv("E2E_SEED", "segredo");
    expect(e2eSeedAllowed(headers())).toBe(false);
    expect(e2eSeedAllowed(headers("outro"))).toBe(false);
    expect(e2eSeedAllowed(headers("segredo"))).toBe(true);

    vi.stubEnv("NODE_ENV", "production");
    expect(e2eSeedAllowed(headers("segredo"))).toBe(false);
  });

  it("sem autorização responde 404 e não cria nada", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_SEED", "segredo");
    expect((await call({ action: "tenant" })).status).toBe(404);
    expect((await call({ action: "tenant" }, "errado")).status).toBe(404);
    vi.stubEnv("NODE_ENV", "production");
    expect((await call({ action: "tenant" }, "segredo")).status).toBe(404);
  });

  it("autorizada: cria um estabelecimento pronto para agendar e agendamentos", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_SEED", "segredo");

    const res = await call({ action: "tenant", name: "Salão Teste", extraProfessionals: ["Léo"] }, "segredo");
    expect(res.status).toBe(200);
    const created = (await res.json()) as { slug: string; serviceIds: string[]; professionalIds: string[] };
    expect(created.serviceIds).toHaveLength(3);
    expect(created.professionalIds).toHaveLength(2);
    expect(await getPublicTenant(created.slug, { db })).toMatchObject({ canBook: true });

    const booking = await call({ action: "booking", slug: created.slug }, "segredo");
    expect(booking.status).toBe(200);
    const { token } = (await booking.json()) as { token: string };
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const list = await call({ action: "bookings", slug: created.slug }, "segredo");
    expect(await list.json()).toMatchObject([
      { status: "scheduled", source: "panel", customerName: "Paula Souza", services: ["Piercing hélix"] },
    ]);

    const unverified = await call({ action: "tenant", verified: false }, "segredo");
    const { slug } = (await unverified.json()) as { slug: string };
    expect(await getPublicTenant(slug, { db })).toMatchObject({ canBook: false, reason: "email_unverified" });
  });
});
