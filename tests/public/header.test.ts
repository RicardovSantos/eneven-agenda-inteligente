import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { loadPublicHeader } from "@/server/public/header";
import { getPublicTenant } from "@/server/public/tenant";
import { createTestDb } from "../helpers/test-db";
import { seedBookable } from "../helpers/public-fixtures";

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

describe("loadPublicHeader", () => {
  it("hoje e a frase de funcionamento no fuso do salão", async () => {
    await seedBookable(db, { slug: "studio", tenant: { address: "Rua X, 120" } });
    const { tenant } = (await getPublicTenant("studio", { db }))!;

    // Segunda 2030-01-07, 10:00 em São Paulo (13:00Z); expediente 9h–18h.
    expect(await loadPublicHeader(db, tenant, new Date("2030-01-07T13:00:00.000Z"))).toEqual({
      today: "2030-01-07",
      subtitle: "Rua X, 120 · Aberto hoje até 18h",
    });
    // 22:30 de domingo em São Paulo ainda é domingo (01:30Z de segunda): fechado hoje.
    expect(await loadPublicHeader(db, tenant, new Date("2030-01-07T01:30:00.000Z"))).toEqual({
      today: "2030-01-06",
      subtitle: "Rua X, 120 · Fechado hoje",
    });
  });
});
