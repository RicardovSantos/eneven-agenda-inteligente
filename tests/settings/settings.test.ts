import sharp from "sharp";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { businessHours, tenantLogos, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  SettingsError,
  checkSlugAvailability,
  getBusinessHours,
  getLogo,
  removeLogo,
  updateBookingRules,
  updateBranding,
  updateBusinessHours,
  updateBusinessInfo,
  updateSlug,
  uploadLogo,
} from "@/server/settings";
import { withTenant } from "@/server/tenant-db";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

let db: Db;
let tenantId: string;
let otherTenantId: string;

beforeEach(async () => {
  db = await createTestDb();
  tenantId = (await seedTenant(db, "salao-a")).id;
  otherTenantId = (await seedTenant(db, "salao-b")).id;
});

const row = async (id = tenantId) =>
  (await db.select().from(tenants).where(eq(tenants.id, id)))[0];

async function expectValidation(promise: Promise<unknown>, field?: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(SettingsError);
  expect((error as SettingsError).code).toBe("validation");
  if (field) expect((error as SettingsError).fieldErrors).toHaveProperty(field);
}

const png = (size = 400) =>
  sharp({
    create: { width: size, height: Math.round(size / 2), channels: 4, background: "#3E07D2" },
  })
    .png()
    .toBuffer();

describe("updateBusinessInfo", () => {
  it("grava e normaliza os dados do estabelecimento", async () => {
    await updateBusinessInfo(db, tenantId, {
      name: "  Studio Defendi ",
      whatsapp: "(11) 98765-4321",
      address: " Rua A, 10 ",
      instagram: "@studio.defendi",
      about: "Cabelo e unhas",
    });
    const t = await row();
    expect(t.name).toBe("Studio Defendi");
    expect(t.whatsapp).toBe("5511987654321");
    expect(t.address).toBe("Rua A, 10");
    expect(t.instagram).toBe("studio.defendi");
    expect(t.about).toBe("Cabelo e unhas");
    expect((await row(otherTenantId)).name).toBe("salao-b");
  });

  it("aceita o Instagram como link e campos opcionais vazios viram nulos", async () => {
    await updateBusinessInfo(db, tenantId, {
      name: "Studio",
      whatsapp: "11987654321",
      address: "",
      instagram: "https://instagram.com/studio.defendi/",
      about: "",
    });
    const t = await row();
    expect(t.instagram).toBe("studio.defendi");
    expect(t.address).toBeNull();
    expect(t.about).toBeNull();
  });

  it("valida nome, WhatsApp, Instagram e o limite de 160 caracteres do sobre", async () => {
    const ok = { name: "A", whatsapp: "11987654321", address: "", instagram: "", about: "" };
    await expectValidation(updateBusinessInfo(db, tenantId, { ...ok, name: " " }), "name");
    await expectValidation(updateBusinessInfo(db, tenantId, { ...ok, whatsapp: "123" }), "whatsapp");
    await expectValidation(updateBusinessInfo(db, tenantId, { ...ok, instagram: "a b!" }), "instagram");
    await expectValidation(updateBusinessInfo(db, tenantId, { ...ok, about: "x".repeat(161) }), "about");
  });
});

describe("updateBranding", () => {
  it("guarda a cor já ajustada para a leitura", async () => {
    const result = await updateBranding(db, tenantId, { color: "#F581FB" });
    expect(result.adjusted).toBe(true);
    expect((await row()).brandColor).toBe(result.color);
    expect(result.color).not.toBe("#F581FB");
  });

  it("não ajusta cor legível e rejeita hex inválido", async () => {
    expect(await updateBranding(db, tenantId, { color: "#3e07d2" })).toEqual({
      color: "#3E07D2",
      adjusted: false,
    });
    await expectValidation(updateBranding(db, tenantId, { color: "azul" }), "color");
  });
});

describe("logo", () => {
  it("converte para PNG quadrado de 256px e guarda por tenant", async () => {
    await uploadLogo(db, tenantId, { mime: "image/png", bytes: await png() });
    const logo = await getLogo(db, tenantId);
    expect(logo?.mime).toBe("image/png");
    const meta = await sharp(logo!.data).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 256, 256]);
    expect(await getLogo(db, otherTenantId)).toBeNull();
  });

  it("aceita jpeg e webp e troca o logo existente", async () => {
    const jpeg = await sharp({ create: { width: 50, height: 80, channels: 3, background: "#fff" } })
      .jpeg()
      .toBuffer();
    const webp = await sharp({ create: { width: 90, height: 40, channels: 3, background: "#000" } })
      .webp()
      .toBuffer();
    await uploadLogo(db, tenantId, { mime: "image/jpeg", bytes: jpeg });
    await uploadLogo(db, tenantId, { mime: "image/webp", bytes: webp });
    const rows = await withTenant(db, tenantId, (tx) => tx.select().from(tenantLogos));
    expect(rows).toHaveLength(1);
  });

  it("recusa arquivo de 2 MB, tipo não permitido e bytes que não são imagem", async () => {
    await expectValidation(
      uploadLogo(db, tenantId, { mime: "image/png", bytes: Buffer.alloc(2 * 1024 * 1024) }),
      "logo",
    );
    await expectValidation(uploadLogo(db, tenantId, { mime: "image/gif", bytes: await png() }), "logo");
    await expectValidation(
      uploadLogo(db, tenantId, { mime: "image/png", bytes: Buffer.from("nao sou imagem") }),
      "logo",
    );
    await expectValidation(uploadLogo(db, tenantId, { mime: "image/png", bytes: Buffer.alloc(0) }), "logo");
  });

  it("recusa imagem com pixels demais (bomba de descompressão) com mensagem amigável", async () => {
    const huge = await sharp({
      create: { width: 6000, height: 6000, channels: 3, background: "#fff" },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(huge.byteLength).toBeLessThan(1024 * 1024);
    await expect(uploadLogo(db, tenantId, { mime: "image/png", bytes: huge })).rejects.toMatchObject({
      code: "validation",
      fieldErrors: { logo: "Imagem grande demais. Use uma imagem menor." },
    });
  });

  it("recusa svg mesmo declarado como png", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    await expectValidation(uploadLogo(db, tenantId, { mime: "image/png", bytes: svg }), "logo");
  });

  it("removeLogo apaga só o do tenant", async () => {
    await uploadLogo(db, tenantId, { mime: "image/png", bytes: await png() });
    await uploadLogo(db, otherTenantId, { mime: "image/png", bytes: await png() });
    await removeLogo(db, tenantId);
    expect(await getLogo(db, tenantId)).toBeNull();
    expect(await getLogo(db, otherTenantId)).not.toBeNull();
    expect((await row()).logoUrl).toBeNull();
  });

  it("logoUrl aponta para a rota pública com versão", async () => {
    await uploadLogo(db, tenantId, { mime: "image/png", bytes: await png() });
    expect((await row()).logoUrl).toMatch(/^\/api\/logo\/salao-a\?v=\d+$/);
  });
});

describe("updateBusinessHours", () => {
  const week = (over: Record<number, Array<{ start: string; end: string }>> = {}) => ({
    0: [],
    1: [
      { start: "09:00", end: "12:00" },
      { start: "13:00", end: "18:00" },
    ],
    2: [{ start: "09:00", end: "18:00" }],
    3: [],
    4: [],
    5: [],
    6: [],
    ...over,
  });

  it("substitui o horário do tenant e devolve na leitura", async () => {
    await updateBusinessHours(db, otherTenantId, week({ 2: [{ start: "10:00", end: "11:00" }] }));
    await updateBusinessHours(db, tenantId, week());
    await updateBusinessHours(db, tenantId, week({ 1: [{ start: "08:00", end: "12:00" }] }));
    const hours = await getBusinessHours(db, tenantId);
    expect(hours[1]).toEqual([{ start: "08:00", end: "12:00" }]);
    expect(hours[2]).toEqual([{ start: "09:00", end: "18:00" }]);
    expect(hours[0]).toEqual([]);
    expect((await getBusinessHours(db, otherTenantId))[2]).toEqual([{ start: "10:00", end: "11:00" }]);
    const rows = await withTenant(db, tenantId, (tx) => tx.select().from(businessHours));
    expect(rows).toHaveLength(2);
  });

  it("recusa intervalos sobrepostos", async () => {
    await expectValidation(
      updateBusinessHours(
        db,
        tenantId,
        week({
          1: [
            { start: "09:00", end: "13:00" },
            { start: "12:00", end: "18:00" },
          ],
        }),
      ),
      "hours",
    );
  });

  it("aceita intervalos que apenas se encostam", async () => {
    await updateBusinessHours(
      db,
      tenantId,
      week({
        1: [
          { start: "09:00", end: "12:00" },
          { start: "12:00", end: "18:00" },
        ],
      }),
    );
  });

  it("recusa início maior ou igual ao fim, formato ruim e dia faltando", async () => {
    await expectValidation(updateBusinessHours(db, tenantId, week({ 1: [{ start: "12:00", end: "09:00" }] })), "hours");
    await expectValidation(updateBusinessHours(db, tenantId, week({ 1: [{ start: "09:00", end: "09:00" }] })), "hours");
    await expectValidation(updateBusinessHours(db, tenantId, week({ 1: [{ start: "9h", end: "10:00" }] })), "hours");
    const missing: Record<number, unknown> = week();
    delete missing[6];
    await expectValidation(updateBusinessHours(db, tenantId, missing as never), "hours");
  });

  it("a validação falha sem apagar o horário que já existia", async () => {
    await updateBusinessHours(db, tenantId, week());
    await expectValidation(updateBusinessHours(db, tenantId, week({ 1: [{ start: "12:00", end: "09:00" }] })));
    expect((await getBusinessHours(db, tenantId))[1]).toHaveLength(2);
  });
});

describe("updateBookingRules", () => {
  it("grava valores permitidos", async () => {
    await updateBookingRules(db, tenantId, {
      slotIntervalMin: 30,
      minNoticeMin: 1440,
      maxDaysAhead: 90,
      cancelWindowMin: 720,
    });
    const t = await row();
    expect([t.slotIntervalMin, t.minNoticeMin, t.maxDaysAhead, t.cancelWindowMin]).toEqual([30, 1440, 90, 720]);
  });

  it("recusa valores fora das listas da tela", async () => {
    const ok = { slotIntervalMin: 15, minNoticeMin: 60, maxDaysAhead: 60, cancelWindowMin: 120 };
    await expectValidation(updateBookingRules(db, tenantId, { ...ok, slotIntervalMin: 25 }), "slotIntervalMin");
    await expectValidation(updateBookingRules(db, tenantId, { ...ok, minNoticeMin: 0 }), "minNoticeMin");
    await expectValidation(updateBookingRules(db, tenantId, { ...ok, maxDaysAhead: 365 }), "maxDaysAhead");
    await expectValidation(updateBookingRules(db, tenantId, { ...ok, cancelWindowMin: 5 }), "cancelWindowMin");
  });
});

describe("updateSlug / checkSlugAvailability", () => {
  it("normaliza e grava o novo link", async () => {
    const result = await updateSlug(db, tenantId, "Studio Defendi!");
    expect(result.slug).toBe("studio-defendi");
    expect((await row()).slug).toBe("studio-defendi");
  });

  it("recusa slug reservado", async () => {
    await expect(updateSlug(db, tenantId, "painel")).rejects.toMatchObject({
      code: "validation",
      fieldErrors: { slug: expect.any(String) },
    });
    expect((await row()).slug).toBe("salao-a");
  });

  it("recusa slug de outro estabelecimento com a mensagem pedida", async () => {
    await expect(updateSlug(db, tenantId, "salao-b")).rejects.toMatchObject({
      code: "validation",
      fieldErrors: { slug: "Esse link já está em uso." },
    });
  });

  it("recusa vazio; manter o mesmo slug não é erro", async () => {
    await expectValidation(updateSlug(db, tenantId, "  "), "slug");
    expect((await updateSlug(db, tenantId, "salao-a")).slug).toBe("salao-a");
  });

  it("slug sem letras nem números (!!!) é recusado", async () => {
    await expect(updateSlug(db, tenantId, "!!!")).rejects.toMatchObject({
      fieldErrors: { slug: "Use letras, números e hífen." },
    });
    expect(await checkSlugAvailability(db, tenantId, "!!!")).toEqual({ status: "invalid" });
  });

  it("atualiza o logoUrl versionado junto com o slug", async () => {
    await uploadLogo(db, tenantId, { mime: "image/png", bytes: await png() });
    await updateSlug(db, tenantId, "novo-nome");
    expect((await row()).logoUrl).toMatch(/^\/api\/logo\/novo-nome\?v=\d+$/);
  });

  it("checkSlugAvailability informa o estado", async () => {
    expect(await checkSlugAvailability(db, tenantId, "salao-a")).toMatchObject({ status: "current" });
    expect(await checkSlugAvailability(db, tenantId, "salao-b")).toMatchObject({ status: "taken" });
    expect(await checkSlugAvailability(db, tenantId, "admin")).toMatchObject({ status: "reserved" });
    expect(await checkSlugAvailability(db, tenantId, "livre-123")).toEqual({
      status: "available",
      slug: "livre-123",
    });
  });
});
