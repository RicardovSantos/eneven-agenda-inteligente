import { beforeEach, describe, expect, it } from "vitest";
import { bookings, professionalHours } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadAvailabilityContext } from "@/server/agenda/load";
import {
  CatalogError,
  deactivateProfessional,
  listProfessionals,
  saveProfessional,
  saveService,
} from "@/server/catalog";
import { updateBusinessHours } from "@/server/settings";
import { emptyWeek, type WeeklyHours } from "@/lib/weekly-hours";
import {
  bookingValues,
  seedCustomer,
  seedProfessional,
  seedTenant,
} from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

let db: Db;
let tenantId: string;
let otherTenantId: string;

const business: WeeklyHours = {
  ...emptyWeek(),
  1: [{ start: "09:00", end: "18:00" }],
  2: [
    { start: "09:00", end: "12:00" },
    { start: "13:00", end: "18:00" },
  ],
};

beforeEach(async () => {
  db = await createTestDb();
  tenantId = (await seedTenant(db, "salao-a")).id;
  otherTenantId = (await seedTenant(db, "salao-b")).id;
  await updateBusinessHours(db, tenantId, business);
});

const base = {
  name: "Bia",
  color: "#B4237A",
  active: true,
  serviceIds: [] as string[],
  hours: business,
};

const service = (name = "Corte") =>
  saveService(db, tenantId, {
    name,
    durationMin: 30,
    bufferAfterMin: 0,
    priceCents: 5000,
    visible: true,
    professionalIds: [],
  });

async function expectValidation(promise: Promise<unknown>, field?: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(CatalogError);
  expect((error as CatalogError).code).toBe("validation");
  if (field) expect((error as CatalogError).fieldErrors).toHaveProperty(field);
  return error as CatalogError;
}

describe("saveProfessional", () => {
  it("limita criação e reativação sem impedir edição ou profissionais inativos", async () => {
    const first = await saveProfessional(db, tenantId, base);
    const second = await saveProfessional(db, tenantId, { ...base, name: "Ana" });
    const inactive = await saveProfessional(db, tenantId, { ...base, name: "Clara", active: false });
    await expectValidation(saveProfessional(db, tenantId, { ...base, name: "Dora" }), "active");
    await expectValidation(saveProfessional(db, tenantId, { ...base, id: inactive.id }), "active");
    await saveProfessional(db, tenantId, { ...base, id: first.id, name: "Editada" });
    await deactivateProfessional(db, tenantId, second.id);
    await saveProfessional(db, tenantId, { ...base, id: inactive.id });
  });
  it("cria com cor, serviços e expediente, e lista de volta", async () => {
    const s = await service();
    const { id } = await saveProfessional(db, tenantId, {
      ...base,
      name: "  Bia ",
      serviceIds: [s.id],
    });
    const [pro] = await listProfessionals(db, tenantId);
    expect(pro).toMatchObject({
      id,
      name: "Bia",
      color: "#B4237A",
      active: true,
      serviceIds: [s.id],
      futureBookings: 0,
    });
    expect(pro.hours[1]).toEqual([{ start: "09:00", end: "18:00" }]);
    expect(pro.hours[2]).toHaveLength(2);
    expect(pro.hours[0]).toEqual([]);
  });

  it("edita, trocando expediente e serviços", async () => {
    const a = await service("A");
    const b = await service("B");
    const { id } = await saveProfessional(db, tenantId, { ...base, serviceIds: [a.id] });
    await saveProfessional(db, tenantId, {
      ...base,
      id,
      name: "Beatriz",
      color: "#0E7C86",
      serviceIds: [b.id],
      hours: { ...emptyWeek(), 1: [{ start: "10:00", end: "12:00" }] },
    });
    const list = await listProfessionals(db, tenantId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Beatriz", color: "#0E7C86", serviceIds: [b.id] });
    expect(list[0].hours[1]).toEqual([{ start: "10:00", end: "12:00" }]);
    expect(list[0].hours[2]).toEqual([]);
    expect(await db.select().from(professionalHours)).toHaveLength(1);
  });

  it("novos profissionais entram no fim da lista", async () => {
    await saveProfessional(db, tenantId, { ...base, name: "A" });
    await saveProfessional(db, tenantId, { ...base, name: "B", color: "#0E7C86" });
    expect((await listProfessionals(db, tenantId)).map((p) => p.name)).toEqual(["A", "B"]);
  });

  it("expediente fora do horário de funcionamento é recusado, sem gravar nada", async () => {
    const error = await expectValidation(
      saveProfessional(db, tenantId, {
        ...base,
        hours: { ...emptyWeek(), 1: [{ start: "08:00", end: "12:00" }] },
      }),
      "hours",
    );
    expect(error.message).toBe(
      "O horário do profissional precisa estar dentro do horário de funcionamento.",
    );
    expect(await listProfessionals(db, tenantId)).toHaveLength(0);
  });

  it("recusa expediente em dia fechado e intervalo que atravessa a pausa do salão", async () => {
    await expectValidation(
      saveProfessional(db, tenantId, {
        ...base,
        hours: { ...emptyWeek(), 3: [{ start: "09:00", end: "10:00" }] },
      }),
      "hours",
    );
    await expectValidation(
      saveProfessional(db, tenantId, {
        ...base,
        hours: { ...emptyWeek(), 2: [{ start: "11:00", end: "14:00" }] },
      }),
      "hours",
    );
  });

  it("aceita expediente que só encosta nas bordas e expediente vazio", async () => {
    await saveProfessional(db, tenantId, { ...base, hours: business });
    await saveProfessional(db, tenantId, {
      ...base,
      name: "Folga",
      color: "#0E7C86",
      hours: emptyWeek(),
    });
    expect(await listProfessionals(db, tenantId)).toHaveLength(2);
  });

  it("recusa horário malformado ou sobreposto", async () => {
    await expectValidation(
      saveProfessional(db, tenantId, {
        ...base,
        hours: { ...emptyWeek(), 1: [{ start: "12:00", end: "10:00" }] },
      }),
      "hours",
    );
    await expectValidation(
      saveProfessional(db, tenantId, {
        ...base,
        hours: {
          ...emptyWeek(),
          1: [
            { start: "09:00", end: "12:00" },
            { start: "11:00", end: "13:00" },
          ],
        },
      }),
      "hours",
    );
  });

  it.each([
    ["nome vazio", { name: " " }, "name"],
    ["nome muito longo", { name: "x".repeat(61) }, "name"],
    ["cor fora da paleta", { color: "#123456" }, "color"],
  ])("rejeita %s", async (_l, patch, field) => {
    await expectValidation(saveProfessional(db, tenantId, { ...base, ...patch }), field);
  });

  it("aceita a cor da paleta em minúsculas e guarda em maiúsculas", async () => {
    await saveProfessional(db, tenantId, { ...base, color: "#b4237a" });
    expect((await listProfessionals(db, tenantId))[0].color).toBe("#B4237A");
  });

  it("não aceita serviço de outro estabelecimento", async () => {
    const foreign = await saveService(db, otherTenantId, {
      name: "Alheio",
      durationMin: 30,
      bufferAfterMin: 0,
      priceCents: 100,
      visible: true,
      professionalIds: [],
    });
    await expectValidation(
      saveProfessional(db, tenantId, { ...base, serviceIds: [foreign.id] }),
      "serviceIds",
    );
    expect(await listProfessionals(db, tenantId)).toHaveLength(0);
  });

  it("não edita profissional de outro estabelecimento", async () => {
    const foreign = await seedProfessional(db, otherTenantId, "Alheia");
    await expect(saveProfessional(db, tenantId, { ...base, id: foreign.id })).rejects.toMatchObject(
      { code: "not_found" },
    );
  });

  it("inativo não é oferecido para novos agendamentos", async () => {
    const s = await service();
    const { id } = await saveProfessional(db, tenantId, { ...base, serviceIds: [s.id] });
    const offered = async () =>
      (await loadAvailabilityContext(db, tenantId, { date: "2030-01-07", serviceIds: [s.id] }))
        .professionals.length;
    expect(await offered()).toBe(1);
    await saveProfessional(db, tenantId, { ...base, id, active: false, serviceIds: [s.id] });
    expect(await offered()).toBe(0);
    await saveProfessional(db, tenantId, { ...base, id, active: true, serviceIds: [s.id] });
    expect(await offered()).toBe(1);
  });
});

describe("deactivateProfessional", () => {
  const first = new Date("2030-01-07T10:00:00.000Z");
  const now = new Date("2030-01-01T00:00:00.000Z");

  async function withBookings(statuses: Array<"scheduled" | "canceled" | "completed">) {
    const { id } = await saveProfessional(db, tenantId, base);
    const customer = await seedCustomer(db, tenantId);
    let index = 0;
    for (const status of statuses) {
      const startsAt = new Date(first.getTime() + index++ * 3_600_000);
      const endsAt = new Date(startsAt.getTime() + 1_800_000);
      await db
        .insert(bookings)
        .values(
          bookingValues(tenantId, id, customer.id, { status, startsAt, endsAt, blockedUntil: endsAt }),
        );
    }
    return id;
  }

  it("desativa e informa quantos agendamentos futuros continuam marcados", async () => {
    const id = await withBookings(["scheduled", "scheduled", "canceled"]);
    const [before] = await listProfessionals(db, tenantId, now);
    expect(before.futureBookings).toBe(2);

    const result = await deactivateProfessional(db, tenantId, id, now);
    expect(result).toEqual({ futureBookings: 2 });
    const [after] = await listProfessionals(db, tenantId, now);
    expect(after.active).toBe(false);
    expect(after.futureBookings).toBe(2);
  });

  it("agendamentos passados não contam", async () => {
    const id = await withBookings(["scheduled"]);
    const later = new Date("2031-01-01T00:00:00.000Z");
    expect(await deactivateProfessional(db, tenantId, id, later)).toEqual({ futureBookings: 0 });
  });

  it("não desativa profissional de outro estabelecimento", async () => {
    const foreign = await seedProfessional(db, otherTenantId, "Alheia");
    await expect(deactivateProfessional(db, tenantId, foreign.id)).rejects.toMatchObject({
      code: "not_found",
    });
    expect((await listProfessionals(db, otherTenantId))[0].active).toBe(true);
  });
});
