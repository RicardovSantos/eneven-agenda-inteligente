import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { professionalServices, services } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadAvailabilityContext } from "@/server/agenda/load";
import { updateBusinessHours } from "@/server/settings";
import {
  CatalogError,
  archiveService,
  listServices,
  restoreService,
  saveProfessional,
  saveService,
} from "@/server/catalog";
import { emptyWeek, type WeeklyHours } from "@/lib/weekly-hours";
import { seedProfessional, seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

let db: Db;
let tenantId: string;
let otherTenantId: string;

beforeEach(async () => {
  db = await createTestDb();
  tenantId = (await seedTenant(db, "salao-a")).id;
  otherTenantId = (await seedTenant(db, "salao-b")).id;
});

const base = {
  name: "Corte",
  durationMin: 30,
  bufferAfterMin: 0,
  priceCents: 5000,
  visible: true,
  professionalIds: [] as string[],
};

async function expectValidation(promise: Promise<unknown>, field?: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(CatalogError);
  expect((error as CatalogError).code).toBe("validation");
  if (field) expect((error as CatalogError).fieldErrors).toHaveProperty(field);
}

describe("saveService", () => {
  it("cria o serviço com os dados normalizados e liga os profissionais", async () => {
    const bia = await seedProfessional(db, tenantId, "Bia");
    const { id } = await saveService(db, tenantId, {
      ...base,
      name: "  Piercing hélix ",
      description: "  Joia inclusa. ",
      durationMin: 45,
      bufferAfterMin: 10,
      priceCents: 9000,
      professionalIds: [bia.id],
    });
    const [list] = await listServices(db, tenantId);
    expect(list).toMatchObject({
      id,
      name: "Piercing hélix",
      description: "Joia inclusa.",
      durationMin: 45,
      bufferAfterMin: 10,
      priceCents: 9000,
      visible: true,
      professionalIds: [bia.id],
    });
    expect(list.archivedAt).toBeNull();
  });

  it("descrição vazia vira nula", async () => {
    await saveService(db, tenantId, { ...base, description: "   " });
    expect((await listServices(db, tenantId))[0].description).toBeNull();
  });

  it("edita um serviço existente e troca os profissionais", async () => {
    const bia = await seedProfessional(db, tenantId, "Bia");
    const leo = await seedProfessional(db, tenantId, "Léo");
    const { id } = await saveService(db, tenantId, { ...base, professionalIds: [bia.id] });
    await saveService(db, tenantId, {
      ...base,
      id,
      name: "Corte masculino",
      priceCents: 6000,
      visible: false,
      professionalIds: [leo.id],
    });
    const list = await listServices(db, tenantId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      name: "Corte masculino",
      priceCents: 6000,
      visible: false,
      professionalIds: [leo.id],
    });
  });

  it("novos serviços entram no fim da lista", async () => {
    await saveService(db, tenantId, { ...base, name: "A" });
    await saveService(db, tenantId, { ...base, name: "B" });
    await saveService(db, tenantId, { ...base, name: "C" });
    expect((await listServices(db, tenantId)).map((s) => s.name)).toEqual(["A", "B", "C"]);
  });

  it.each([
    ["nome vazio", { name: "   " }, "name"],
    ["nome muito longo", { name: "x".repeat(81) }, "name"],
    ["descrição muito longa", { description: "x".repeat(301) }, "description"],
    ["duração menor que 5", { durationMin: 0 }, "durationMin"],
    ["duração fora do múltiplo de 5", { durationMin: 32 }, "durationMin"],
    ["duração acima de 480", { durationMin: 485 }, "durationMin"],
    ["duração fracionada", { durationMin: 7.5 }, "durationMin"],
    ["intervalo negativo", { bufferAfterMin: -5 }, "bufferAfterMin"],
    ["intervalo acima de 60", { bufferAfterMin: 65 }, "bufferAfterMin"],
    ["preço negativo", { priceCents: -1 }, "priceCents"],
    ["preço fracionado", { priceCents: 10.5 }, "priceCents"],
    ["preço enorme", { priceCents: 2_000_000_000 }, "priceCents"],
  ])("rejeita %s", async (_label, patch, field) => {
    await expectValidation(saveService(db, tenantId, { ...base, ...patch }), field);
    expect(await listServices(db, tenantId)).toHaveLength(0);
  });

  it("aceita preço zero e as bordas de duração e intervalo", async () => {
    await saveService(db, tenantId, {
      ...base,
      durationMin: 480,
      bufferAfterMin: 60,
      priceCents: 0,
    });
    await saveService(db, tenantId, { ...base, name: "Mínimo", durationMin: 5 });
    expect(await listServices(db, tenantId)).toHaveLength(2);
  });

  it("não aceita profissional de outro estabelecimento nem inexistente", async () => {
    const foreign = await seedProfessional(db, otherTenantId, "Intrusa");
    await expectValidation(
      saveService(db, tenantId, { ...base, professionalIds: [foreign.id] }),
      "professionalIds",
    );
    await expectValidation(
      saveService(db, tenantId, {
        ...base,
        professionalIds: ["00000000-0000-4000-8000-000000000000"],
      }),
      "professionalIds",
    );
    await expectValidation(
      saveService(db, tenantId, { ...base, professionalIds: ["nao-e-id"] }),
      "professionalIds",
    );
    expect(await listServices(db, tenantId)).toHaveLength(0);
    expect(await db.select().from(professionalServices)).toHaveLength(0);
  });

  it("não edita serviço de outro estabelecimento", async () => {
    const { id } = await saveService(db, otherTenantId, { ...base, name: "Do outro" });
    const error = await saveService(db, tenantId, { ...base, id, name: "Invadido" }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(CatalogError);
    expect((error as CatalogError).code).toBe("not_found");
    const [row] = await db.select().from(services).where(eq(services.id, id));
    expect(row.name).toBe("Do outro");
  });
});

describe("archiveService / restoreService", () => {
  it("arquivar tira da lista padrão; restaurar devolve", async () => {
    const { id } = await saveService(db, tenantId, base);
    await archiveService(db, tenantId, id);
    expect(await listServices(db, tenantId)).toHaveLength(0);
    const all = await listServices(db, tenantId, { includeArchived: true });
    expect(all).toHaveLength(1);
    expect(all[0].archivedAt).toBeInstanceOf(Date);

    await restoreService(db, tenantId, id);
    const [back] = await listServices(db, tenantId);
    expect(back.archivedAt).toBeNull();
  });

  it("não mexe em serviço de outro estabelecimento", async () => {
    const { id } = await saveService(db, otherTenantId, base);
    await expect(archiveService(db, tenantId, id)).rejects.toMatchObject({ code: "not_found" });
    expect(await listServices(db, otherTenantId)).toHaveLength(1);
  });

  it("o vínculo com profissionais sobrevive ao arquivamento", async () => {
    const bia = await seedProfessional(db, tenantId, "Bia");
    const { id } = await saveService(db, tenantId, { ...base, professionalIds: [bia.id] });
    await archiveService(db, tenantId, id);
    await restoreService(db, tenantId, id);
    expect((await listServices(db, tenantId))[0].professionalIds).toEqual([bia.id]);
  });
});

describe("serviço na página pública (via motor de disponibilidade)", () => {
  const week = (start: string, end: string): WeeklyHours => ({
    ...emptyWeek(),
    1: [{ start, end }],
  });

  async function setup(linked: boolean) {
    await updateBusinessHours(db, tenantId, week("09:00", "18:00"));
    const bia = await seedProfessional(db, tenantId, "Bia");
    await saveProfessional(db, tenantId, {
      id: bia.id,
      name: "Bia",
      color: "#B4237A",
      active: true,
      serviceIds: [],
      hours: week("09:00", "18:00"),
    });
    const { id } = await saveService(db, tenantId, {
      ...base,
      professionalIds: linked ? [bia.id] : [],
    });
    return id;
  }

  const offered = async (serviceId: string) =>
    (
      await loadAvailabilityContext(db, tenantId, {
        date: "2030-01-07",
        serviceIds: [serviceId],
      })
    ).professionals.length;

  it("serviço sem profissional não é oferecido", async () => {
    expect(await offered(await setup(false))).toBe(0);
  });

  it("com profissional ativo que o faz, é oferecido", async () => {
    expect(await offered(await setup(true))).toBe(1);
  });
});
