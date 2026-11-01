import sharp from "sharp";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { professionals, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { saveHeroPhoto, saveProfessionalPhoto } from "@/server/media";
import { loadPublicPageContent, toTeamMember } from "@/server/public/page-content";
import { getPublicTenant } from "@/server/public/tenant";
import { SettingsError, updateBusinessInfo, updateHeroText } from "@/server/settings";
import { seedBookable } from "../helpers/public-fixtures";
import { createTestDb } from "../helpers/test-db";

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

const image = () =>
  sharp({ create: { width: 900, height: 500, channels: 3, background: "#369" } })
    .jpeg()
    .toBuffer();

const info = (overrides: Record<string, string> = {}) => ({
  name: "Studio",
  whatsapp: "11987654321",
  address: "Rua X, 120",
  instagram: "",
  facebook: "",
  about: "",
  ...overrides,
});

describe("Facebook e texto do carrossel", () => {
  it("aceita usuário, @usuario e link da página, e guarda só o nome", async () => {
    const seed = await seedBookable(db, { slug: "studio" });
    for (const input of ["studio.ricardo", "@studio.ricardo", "https://www.facebook.com/studio.ricardo/?ref=x", "fb.com/studio.ricardo"]) {
      await updateBusinessInfo(db, seed.tenantId, info({ facebook: input }));
      const [row] = await db.select().from(tenants).where(eq(tenants.id, seed.tenantId));
      expect(row.facebook).toBe("studio.ricardo");
    }
    await updateBusinessInfo(db, seed.tenantId, info());
    const [cleared] = await db.select().from(tenants).where(eq(tenants.id, seed.tenantId));
    expect(cleared.facebook).toBeNull();
  });

  it("recusa Facebook inválido", async () => {
    const seed = await seedBookable(db, { slug: "studio" });
    await expect(
      updateBusinessInfo(db, seed.tenantId, info({ facebook: "a b" })),
    ).rejects.toBeInstanceOf(SettingsError);
  });

  it("guarda o título e a frase do carrossel e limpa quando vazios", async () => {
    const seed = await seedBookable(db, { slug: "studio" });
    await updateHeroText(db, seed.tenantId, { heroTitle: " Bem-vindo ", heroSubtitle: "Agende já" });
    let [row] = await db.select().from(tenants).where(eq(tenants.id, seed.tenantId));
    expect([row.heroTitle, row.heroSubtitle]).toEqual(["Bem-vindo", "Agende já"]);
    await updateHeroText(db, seed.tenantId, { heroTitle: "", heroSubtitle: "" });
    [row] = await db.select().from(tenants).where(eq(tenants.id, seed.tenantId));
    expect([row.heroTitle, row.heroSubtitle]).toEqual([null, null]);
    await expect(
      updateHeroText(db, seed.tenantId, { heroTitle: "x".repeat(61), heroSubtitle: "" }),
    ).rejects.toBeInstanceOf(SettingsError);
  });
});

describe("conteúdo da página pública", () => {
  it("traz as imagens do carrossel em ordem, a equipe com foto e cargo e o horário agrupado", async () => {
    const seed = await seedBookable(db, { slug: "studio", pros: 2 });
    await saveHeroPhoto(db, seed.tenantId, 2, { bytes: await image() });
    await saveHeroPhoto(db, seed.tenantId, 0, { bytes: await image() });
    await saveProfessionalPhoto(db, seed.tenantId, seed.proIds[0], { bytes: await image() });
    await db.update(professionals).set({ title: "Barbeiro" }).where(eq(professionals.id, seed.proIds[0]));
    await db
      .update(tenants)
      .set({ facebook: "studiofb", instagram: "studioig", heroTitle: "Olá" })
      .where(eq(tenants.id, seed.tenantId));

    const resolved = (await getPublicTenant("studio", { db }))!;
    const content = await loadPublicPageContent(db, resolved.tenant, resolved.catalog!);

    expect(content.heroImages).toHaveLength(2);
    expect(content.heroImages[0]).toMatch(/^\/api\/midia\/studio\/capa\/0\?v=\d+$/);
    expect(content.heroImages[1]).toMatch(/^\/api\/midia\/studio\/capa\/2\?v=\d+$/);
    expect(content.heroTitle).toBe("Olá");
    expect(content.facebook).toBe("studiofb");
    expect(content.instagram).toBe("studioig");
    expect(content.team[0]).toMatchObject({ id: seed.proIds[0], title: "Barbeiro" });
    expect(content.team[0].photoUrl).toMatch(
      new RegExp(`^/api/midia/studio/profissional/${seed.proIds[0]}\\?v=\\d+$`),
    );
    expect(content.team[1].photoUrl).toBeNull();
    expect(content.weekRows[0]).toMatchObject({ label: "Segunda a sábado", closed: false });
    expect(content.weekRows.at(-1)).toMatchObject({ label: "Domingo", closed: true });
  });

  it("toTeamMember não inventa foto para quem não tem", async () => {
    const seed = await seedBookable(db, { slug: "studio" });
    const resolved = (await getPublicTenant("studio", { db }))!;
    const member = toTeamMember("studio", resolved.catalog!.professionals[0]);
    expect(member).toMatchObject({ id: seed.proIds[0], photoUrl: null });
  });
});
