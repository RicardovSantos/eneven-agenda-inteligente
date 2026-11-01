import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MediaError, convertToWebp } from "@/server/media/image";
import {
  getHeroPhoto,
  getProfessionalPhoto,
  listHeroPhotos,
  removeHeroPhoto,
  removeProfessionalPhoto,
  saveHeroPhoto,
  saveProfessionalPhoto,
} from "@/server/media";
import { professionals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { seedProfessional, seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

const make = (format: "jpeg" | "png" | "gif" | "webp", w = 800, h = 600) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#c33" } })
    [format]()
    .toBuffer();

describe("convertToWebp", () => {
  it.each(["jpeg", "png", "gif", "webp"] as const)("converte %s para WebP no tamanho pedido", async (format) => {
    const out = await convertToWebp(await make(format), { width: 400, height: 200 });
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect([meta.width, meta.height]).toEqual([400, 200]);
  });

  it("recusa arquivo que não é imagem, mesmo com tipo declarado", async () => {
    await expect(convertToWebp(Buffer.from("<svg/>"), { width: 10, height: 10 })).rejects.toBeInstanceOf(MediaError);
  });

  it("recusa arquivo vazio e arquivo grande demais", async () => {
    await expect(convertToWebp(Buffer.alloc(0), { width: 10, height: 10 })).rejects.toThrow(/vazio/);
    await expect(convertToWebp(Buffer.alloc(2_000_000), { width: 10, height: 10 })).rejects.toThrow(/grande demais/);
  });
});

describe("fotos do carrossel", () => {
  it("guarda em WebP, lista por posição e remove", async () => {
    const db = await createTestDb();
    const t = await seedTenant(db, "loja-a");
    await saveHeroPhoto(db, t.id, 1, { bytes: await make("jpeg", 2000, 1200) });
    await saveHeroPhoto(db, t.id, 0, { bytes: await make("png") });
    expect((await listHeroPhotos(db, t.id)).map((p) => p.slot)).toEqual([0, 1]);
    const stored = await getHeroPhoto(db, t.id, 1);
    expect(stored?.mime).toBe("image/webp");
    expect((await sharp(stored!.data).metadata()).format).toBe("webp");
    await removeHeroPhoto(db, t.id, 1);
    expect(await getHeroPhoto(db, t.id, 1)).toBeNull();
  });

  it("recusa posição fora de 0 a 2", async () => {
    const db = await createTestDb();
    const t = await seedTenant(db, "loja-a");
    await expect(saveHeroPhoto(db, t.id, 3, { bytes: await make("png") })).rejects.toBeInstanceOf(MediaError);
  });

  it("não deixa um tenant ler a imagem de outro", async () => {
    const db = await createTestDb();
    const a = await seedTenant(db, "loja-a");
    const b = await seedTenant(db, "loja-b");
    await saveHeroPhoto(db, a.id, 0, { bytes: await make("png") });
    expect(await getHeroPhoto(db, b.id, 0)).toBeNull();
  });
});

describe("foto do profissional", () => {
  it("guarda, marca a versão no profissional e remove", async () => {
    const db = await createTestDb();
    const t = await seedTenant(db, "loja-a");
    const pro = await seedProfessional(db, t.id);
    await saveProfessionalPhoto(db, t.id, pro.id, { bytes: await make("jpeg") });
    const [row] = await db.select().from(professionals).where(eq(professionals.id, pro.id));
    expect(row.photoUpdatedAt).toBeInstanceOf(Date);
    const stored = await getProfessionalPhoto(db, t.id, pro.id);
    expect((await sharp(stored!.data).metadata()).format).toBe("webp");
    await removeProfessionalPhoto(db, t.id, pro.id);
    expect(await getProfessionalPhoto(db, t.id, pro.id)).toBeNull();
    const [after] = await db.select().from(professionals).where(eq(professionals.id, pro.id));
    expect(after.photoUpdatedAt).toBeNull();
  });

  it("recusa profissional de outro estabelecimento", async () => {
    const db = await createTestDb();
    const a = await seedTenant(db, "loja-a");
    const b = await seedTenant(db, "loja-b");
    const proB = await seedProfessional(db, b.id);
    await expect(
      saveProfessionalPhoto(db, a.id, proB.id, { bytes: await make("png") }),
    ).rejects.toBeInstanceOf(MediaError);
    expect(await getProfessionalPhoto(db, b.id, proB.id)).toBeNull();
  });
});
