import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { professionals, services } from "@/db/schema";
import type { Db } from "@/db/types";
import { emptyWeek } from "@/lib/weekly-hours";
import { updateBusinessHours } from "@/server/settings";
import { listProfessionals, listServices } from "@/server/catalog";
import { seedProfessional, seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

const state = vi.hoisted(() => ({
  db: undefined as unknown,
  session: undefined as unknown,
}));

vi.mock("@/db/client", () => ({ getDb: async () => state.db }));
vi.mock("@/server/auth/guard", () => ({
  requireTenantSession: async () => state.session,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import {
  archiveServiceAction,
  restoreServiceAction,
  saveServiceAction,
} from "@/app/painel/servicos/actions";
import {
  deactivateProfessionalAction,
  saveProfessionalAction,
} from "@/app/painel/equipe/actions";

let db: Db;
let tenantId: string;
let otherTenantId: string;

const asRole = (role: "owner" | "reception" | "staff") => {
  state.session = { userId: "u1", tenantId, role, isSuperAdmin: false, emailVerified: true, support: false };
};

const serviceInput = {
  name: "Corte",
  durationMin: 30,
  bufferAfterMin: 0,
  priceCents: 5000,
  visible: true,
  professionalIds: [] as string[],
};

const week = { ...emptyWeek(), 1: [{ start: "09:00", end: "18:00" }] };
const proInput = {
  name: "Bia",
  color: "#B4237A",
  active: true,
  serviceIds: [] as string[],
  hours: week,
};

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  tenantId = (await seedTenant(db, "salao-a")).id;
  otherTenantId = (await seedTenant(db, "salao-b")).id;
  await updateBusinessHours(db, tenantId, week);
  asRole("owner");
});

describe("ações de serviços e equipe: papel", () => {
  it.each(["staff", "reception"] as const)("%s só vê, não altera", async (role) => {
    const bia = await seedProfessional(db, tenantId, "Bia");
    const svc = await (async () => {
      asRole("owner");
      const result = await saveServiceAction(serviceInput);
      return result.id!;
    })();
    asRole(role);

    const results = [
      await saveServiceAction({ ...serviceInput, name: "Invadido" }),
      await archiveServiceAction(svc),
      await restoreServiceAction(svc),
      await saveProfessionalAction(proInput),
      await deactivateProfessionalAction(bia.id),
    ];
    for (const r of results) {
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/proprietário/);
    }
    expect((await listServices(db, tenantId)).map((s) => s.name)).toEqual(["Corte"]);
    expect((await listServices(db, tenantId))[0].archivedAt).toBeNull();
    expect((await listProfessionals(db, tenantId))[0].active).toBe(true);
  });
});

describe("ações do proprietário", () => {
  it("salva serviço com toast, usando o tenant da sessão", async () => {
    const result = await saveServiceAction({ ...serviceInput, tenantId: otherTenantId });
    expect(result).toMatchObject({ ok: true, message: "Serviço salvo" });
    expect(await listServices(db, tenantId)).toHaveLength(1);
    expect(await listServices(db, otherTenantId)).toHaveLength(0);
  });

  it("devolve erro por campo quando a validação falha", async () => {
    const result = await saveServiceAction({ ...serviceInput, durationMin: 32 });
    expect(result.ok).toBe(false);
    expect(result.fieldErrors).toHaveProperty("durationMin");
  });

  it.each([null, undefined, "texto", 42, []])("entrada %j não derruba a ação", async (input) => {
    const result = await saveServiceAction(input);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("arquiva e restaura", async () => {
    const { id } = await saveServiceAction(serviceInput);
    expect((await archiveServiceAction(id)).message).toBe("Serviço arquivado");
    expect(await listServices(db, tenantId)).toHaveLength(0);
    expect((await restoreServiceAction(id)).message).toBe("Serviço restaurado");
    expect(await listServices(db, tenantId)).toHaveLength(1);
  });

  it("não arquiva serviço de outro estabelecimento", async () => {
    const [other] = await db
      .insert(services)
      .values({ tenantId: otherTenantId, name: "Alheio", durationMin: 30, priceCents: 1 })
      .returning();
    const result = await archiveServiceAction(other.id);
    expect(result.ok).toBe(false);
    expect((await db.select().from(services).where(eq(services.id, other.id)))[0].archivedAt).toBeNull();
  });

  it("salva profissional e recusa expediente fora do funcionamento", async () => {
    expect(await saveProfessionalAction(proInput)).toMatchObject({
      ok: true,
      message: "Profissional salvo",
    });
    const bad = await saveProfessionalAction({
      ...proInput,
      name: "Léo",
      hours: { ...emptyWeek(), 1: [{ start: "07:00", end: "10:00" }] },
    });
    expect(bad.ok).toBe(false);
    expect(bad.fieldErrors?.hours).toMatch(/dentro do horário de funcionamento/);
    expect(await listProfessionals(db, tenantId)).toHaveLength(1);
  });

  it("entrada de horário malformada não derruba a ação", async () => {
    for (const hours of [null, "x", {}, { 0: "x" }]) {
      const result = await saveProfessionalAction({ ...proInput, hours });
      expect(result.ok).toBe(false);
    }
  });

  it("desativa profissional", async () => {
    const { id } = await saveProfessionalAction(proInput);
    expect((await deactivateProfessionalAction(id)).message).toBe("Profissional desativado");
    const [row] = await db.select().from(professionals).where(eq(professionals.id, id!));
    expect(row.active).toBe(false);
  });
});
