import { describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { checkDatabase } from "@/server/health/db-check";
import { createTestDb } from "./helpers/test-db";

describe("checkDatabase", () => {
  it("banco respondendo: 200 e ok", async () => {
    const db = await createTestDb();
    const res = await checkDatabase(async () => db);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", db: "ok" });
  });

  it("banco que falha: 503 sem vazar o erro", async () => {
    const db = {
      execute: async () => {
        throw new Error("password authentication failed for user postgres@10.0.0.5");
      },
    } as unknown as Db;
    const res = await checkDatabase(async () => db);
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ status: "error", db: "unreachable" });
    expect(text).not.toMatch(/password|postgres|10\.0/);
  });

  it("não conseguir obter a conexão também dá 503", async () => {
    const res = await checkDatabase(async () => {
      throw new Error("DATABASE_URL não definido");
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "error", db: "unreachable" });
  });

  it("banco que não responde: 503 depois do tempo limite", async () => {
    const db = { execute: () => new Promise(() => {}) } as unknown as Db;
    const started = Date.now();
    const res = await checkDatabase(async () => db, 50);
    expect(res.status).toBe(503);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(await res.json()).toEqual({ status: "error", db: "unreachable" });
  });
});

describe("GET /api/health/db", () => {
  it("é dinâmica e a liveness continua separada", async () => {
    const route = await import("@/app/api/health/db/route");
    expect(route.dynamic).toBe("force-dynamic");
    const liveness = await import("@/app/api/health/route");
    expect(await liveness.GET().json()).toEqual({ status: "ok" });
  });
});
