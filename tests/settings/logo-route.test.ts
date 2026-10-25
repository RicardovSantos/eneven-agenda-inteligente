import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/types";
import { uploadLogo } from "@/server/settings";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({ getDb: async () => state.db }));

import { GET } from "@/app/api/logo/[slug]/route";

let db: Db;

const call = (slug: string) =>
  GET(new Request(`http://localhost/api/logo/${slug}`), {
    params: Promise.resolve({ slug }),
  } as never);

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
});

describe("GET /api/logo/[slug]", () => {
  it("devolve o PNG com cache de 5 minutos", async () => {
    const tenant = await seedTenant(db, "com-logo");
    const bytes = await sharp({
      create: { width: 300, height: 300, channels: 3, background: "#0E7C86" },
    })
      .png()
      .toBuffer();
    await uploadLogo(db, tenant.id, { mime: "image/png", bytes });

    const res = await call("com-logo");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([256, 256]);
  });

  it("404 sem logo e para slug inexistente", async () => {
    await seedTenant(db, "sem-logo");
    expect((await call("sem-logo")).status).toBe(404);
    expect((await call("nao-existe")).status).toBe(404);
  });

  it("não vaza o logo de outro estabelecimento", async () => {
    const a = await seedTenant(db, "loja-a");
    await seedTenant(db, "loja-b");
    const bytes = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#000" },
    })
      .png()
      .toBuffer();
    await uploadLogo(db, a.id, { mime: "image/png", bytes });
    expect((await call("loja-b")).status).toBe(404);
  });
});
