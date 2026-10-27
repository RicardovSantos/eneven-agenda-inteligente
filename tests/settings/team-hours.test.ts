import { beforeEach, describe, expect, it } from "vitest";
import { professionalHours, professionals } from "@/db/schema";
import type { Db } from "@/db/types";
import { emptyWeek, type WeeklyHours } from "@/lib/weekly-hours";
import { listProfessionals } from "@/server/catalog/professionals";
import { defaultApplyToTeam, getBusinessHours, updateBusinessHours } from "@/server/settings";
import { withTenant } from "@/server/tenant-db";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

let db: Db;
let tenantId: string;
let otherTenantId: string;

const week = (over: Partial<Record<number, Array<{ start: string; end: string }>>> = {}): WeeklyHours => ({
  ...emptyWeek(),
  ...over,
});
const workdays = (start: string, end: string): WeeklyHours =>
  week({ 1: [{ start, end }], 2: [{ start, end }], 3: [{ start, end }] });

async function addPro(id: string, hours: WeeklyHours, active = true, tenant = tenantId) {
  await withTenant(db, tenant, async (tx) => {
    const [p] = await tx
      .insert(professionals)
      .values({ tenantId: tenant, name: id, active })
      .returning();
    const rows = ([0, 1, 2, 3, 4, 5, 6] as const).flatMap((weekday) =>
      hours[weekday].map((r) => ({
        tenantId: tenant,
        professionalId: p.id,
        weekday,
        startsAt: r.start,
        endsAt: r.end,
      })),
    );
    if (rows.length) await tx.insert(professionalHours).values(rows);
  });
}

const teamHours = async (t = tenantId) =>
  Object.fromEntries((await listProfessionals(db, t)).map((p) => [p.name, p.hours]));

beforeEach(async () => {
  db = await createTestDb();
  tenantId = (await seedTenant(db, "salao-a")).id;
  otherTenantId = (await seedTenant(db, "salao-b")).id;
  await updateBusinessHours(db, tenantId, workdays("09:00", "18:00"));
  await updateBusinessHours(db, otherTenantId, workdays("09:00", "18:00"));
});

describe("updateBusinessHours com a equipe", () => {
  it("aplicar à equipe: substitui o expediente dos ativos (inativos ficam recortados) na mesma gravação", async () => {
    await addPro("ana", workdays("09:00", "18:00"));
    await addPro("bia", week({ 1: [{ start: "10:00", end: "12:00" }] }));
    await addPro("ines", workdays("09:00", "18:00"), false);
    await addPro("outra", workdays("09:00", "18:00"), true, otherTenantId);

    const result = await updateBusinessHours(db, tenantId, workdays("08:00", "20:00"), {
      applyToTeam: true,
    });

    const team = await teamHours();
    expect(team.ana).toEqual(workdays("08:00", "20:00"));
    expect(team.bia).toEqual(workdays("08:00", "20:00"));
    expect(team.ines).toEqual(workdays("09:00", "18:00"));
    expect(await getBusinessHours(db, tenantId)).toEqual(workdays("08:00", "20:00"));
    expect((await teamHours(otherTenantId)).outra).toEqual(workdays("09:00", "18:00"));
    expect(result.teamOutOfSync).toBe(false);
  });

  it("não aplicar: recorta o expediente à nova janela (09-18 vira 10-16)", async () => {
    await addPro("ana", workdays("09:00", "18:00"));
    const result = await updateBusinessHours(db, tenantId, workdays("10:00", "16:00"), {
      applyToTeam: false,
    });
    expect((await teamHours()).ana).toEqual(workdays("10:00", "16:00"));
    expect(result.teamOutOfSync).toBe(false);
  });

  it("não aplicar: intervalos que sobram vazios somem e dias fechados esvaziam o expediente", async () => {
    await addPro(
      "ana",
      week({
        1: [
          { start: "09:00", end: "11:00" },
          { start: "14:00", end: "18:00" },
        ],
        2: [{ start: "09:00", end: "12:00" }],
        3: [{ start: "09:00", end: "18:00" }],
      }),
    );
    await updateBusinessHours(
      db,
      tenantId,
      week({ 1: [{ start: "12:00", end: "16:00" }], 2: [{ start: "13:00", end: "18:00" }] }),
    );
    expect((await teamHours()).ana).toEqual(week({ 1: [{ start: "14:00", end: "16:00" }] }));
  });

  it("não aplicar: janela com pausa parte o expediente em dois", async () => {
    await addPro("ana", workdays("09:00", "18:00"));
    await updateBusinessHours(
      db,
      tenantId,
      week({
        1: [
          { start: "09:00", end: "12:00" },
          { start: "13:00", end: "18:00" },
        ],
      }),
    );
    expect((await teamHours()).ana[1]).toEqual([
      { start: "09:00", end: "12:00" },
      { start: "13:00", end: "18:00" },
    ]);
  });

  it("ampliar sem aplicar não altera a equipe e avisa que ela ficou diferente", async () => {
    await addPro("ana", workdays("09:00", "18:00"));
    const result = await updateBusinessHours(db, tenantId, workdays("08:00", "20:00"));
    expect((await teamHours()).ana).toEqual(workdays("09:00", "18:00"));
    expect(result.teamOutOfSync).toBe(true);
  });

  it("sem opções o padrão é não aplicar (recortar)", async () => {
    await addPro("ana", workdays("09:00", "18:00"));
    await updateBusinessHours(db, tenantId, workdays("10:00", "16:00"));
    expect((await teamHours()).ana).toEqual(workdays("10:00", "16:00"));
  });

  it("horário inválido não toca no expediente da equipe", async () => {
    await addPro("ana", workdays("09:00", "18:00"));
    await expect(
      updateBusinessHours(db, tenantId, workdays("18:00", "09:00"), { applyToTeam: true }),
    ).rejects.toThrow();
    expect((await teamHours()).ana).toEqual(workdays("09:00", "18:00"));
  });
});

describe("defaultApplyToTeam", () => {
  it("um profissional ativo: marcado, mesmo com expediente diferente", async () => {
    await addPro("ana", workdays("10:00", "12:00"));
    await addPro("ines", workdays("09:00", "18:00"), false);
    expect(await defaultApplyToTeam(db, tenantId)).toBe(true);
  });

  it("vários ativos com o expediente igual ao funcionamento: marcado", async () => {
    await addPro("ana", workdays("09:00", "18:00"));
    await addPro("bia", workdays("09:00", "18:00"));
    expect(await defaultApplyToTeam(db, tenantId)).toBe(true);
  });

  it("vários ativos e algum diferente: desmarcado", async () => {
    await addPro("ana", workdays("09:00", "18:00"));
    await addPro("bia", workdays("10:00", "16:00"));
    expect(await defaultApplyToTeam(db, tenantId)).toBe(false);
  });

  it("ignora a ordem dos dias e dos intervalos ao comparar", async () => {
    await addPro("ana", workdays("09:00", "18:00"));
    await addPro("bia", workdays("09:00", "18:00"));
    expect(await defaultApplyToTeam(db, tenantId)).toBe(true);
  });

  it("sem profissionais ativos: desmarcado", async () => {
    expect(await defaultApplyToTeam(db, tenantId)).toBe(false);
  });
});
