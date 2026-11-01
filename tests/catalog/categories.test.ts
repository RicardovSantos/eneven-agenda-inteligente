import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { serviceCategories } from "@/db/schema";
import type { Db } from "@/db/types";
import { CatalogError, listServices, saveService } from "@/server/catalog";
import { getPublicCatalog } from "@/server/public/tenant";
import { withTenant } from "@/server/tenant-db";
import { seedProfessional, seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

let db: Db;
let tenantId: string;
let proId: string;

beforeEach(async () => {
  db = await createTestDb();
  tenantId = (await seedTenant(db, "salao-a")).id;
  proId = (await seedProfessional(db, tenantId)).id;
});

const base = {
  durationMin: 30,
  bufferAfterMin: 0,
  priceCents: 5000,
  visible: true,
};

const categoriesOf = (id: string) =>
  withTenant(db, id, (tx) =>
    tx.select().from(serviceCategories).where(eq(serviceCategories.tenantId, id)).orderBy(serviceCategories.sortOrder),
  );

describe("categorias de serviços", () => {
  it("cria a categoria pelo nome e reaproveita a mesma, sem diferenciar maiúsculas", async () => {
    await saveService(db, tenantId, { ...base, name: "Corte", categoryName: "Cabelo", professionalIds: [proId] });
    await saveService(db, tenantId, { ...base, name: "Escova", categoryName: "  cabelo ", professionalIds: [proId] });
    expect(await categoriesOf(tenantId)).toHaveLength(1);
    const rows = await listServices(db, tenantId);
    expect(rows.map((r) => r.categoryName)).toEqual(["Cabelo", "Cabelo"]);
    expect(rows[0].categoryId).toBe(rows[1].categoryId);
  });

  it("serviço sem categoria fica sem grupo e a categoria que esvazia some", async () => {
    const { id } = await saveService(db, tenantId, { ...base, name: "Corte", categoryName: "Cabelo", professionalIds: [proId] });
    expect(await categoriesOf(tenantId)).toHaveLength(1);
    await saveService(db, tenantId, { ...base, id, name: "Corte", categoryName: "", professionalIds: [proId] });
    expect(await categoriesOf(tenantId)).toHaveLength(0);
    expect((await listServices(db, tenantId))[0].categoryName).toBeNull();
  });

  it("mover o único serviço para outra categoria apaga a antiga", async () => {
    const { id } = await saveService(db, tenantId, { ...base, name: "Corte", categoryName: "Cabelo", professionalIds: [proId] });
    await saveService(db, tenantId, { ...base, id, name: "Corte", categoryName: "Barba", professionalIds: [proId] });
    expect((await categoriesOf(tenantId)).map((c) => c.name)).toEqual(["Barba"]);
  });

  it("recusa nome de categoria grande demais", async () => {
    await expect(
      saveService(db, tenantId, { ...base, name: "Corte", categoryName: "x".repeat(41), professionalIds: [proId] }),
    ).rejects.toBeInstanceOf(CatalogError);
  });

  it("uma loja não enxerga nem reaproveita a categoria da outra", async () => {
    const other = (await seedTenant(db, "salao-b")).id;
    const otherPro = (await seedProfessional(db, other)).id;
    await saveService(db, tenantId, { ...base, name: "Corte", categoryName: "Cabelo", professionalIds: [proId] });
    await saveService(db, other, { ...base, name: "Corte", categoryName: "Cabelo", professionalIds: [otherPro] });
    const a = await categoriesOf(tenantId);
    const b = await categoriesOf(other);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].id).not.toBe(b[0].id);
  });

  it("a página pública recebe as categorias em ordem e só as que têm serviço oferecido", async () => {
    await saveService(db, tenantId, { ...base, name: "Corte", categoryName: "Cabelo", professionalIds: [proId] });
    await saveService(db, tenantId, { ...base, name: "Make", categoryName: "Maquiagem", professionalIds: [proId] });
    await saveService(db, tenantId, { ...base, name: "Sem grupo", professionalIds: [proId] });
    // Categoria cujo único serviço está escondido não aparece.
    await saveService(db, tenantId, { ...base, name: "Oculto", categoryName: "Oculta", visible: false, professionalIds: [proId] });
    const catalog = await getPublicCatalog(db, tenantId);
    expect(catalog.categories.map((c) => c.name)).toEqual(["Cabelo", "Maquiagem"]);
    const byName = Object.fromEntries(catalog.services.map((s) => [s.name, s.categoryId]));
    expect(byName["Sem grupo"]).toBeNull();
    expect(byName["Corte"]).toBe(catalog.categories[0].id);
  });
});
