import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { professionals, services } from "@/db/schema";
import type { Db } from "@/db/types";
import { createBooking } from "@/server/agenda/bookings";
import { BookingError } from "@/server/agenda/errors";
import { listPublicDates, listPublicSlots } from "@/server/public/slots";
import { createTestDb } from "../helpers/test-db";
import { seedBookable, type PublicSeed } from "../helpers/public-fixtures";

// Terça 2030-01-01, 09:00 em São Paulo (UTC-3).
const NOW = new Date("2030-01-01T12:00:00.000Z");
const MONDAY = "2030-01-07";
const local = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00.000-03:00`);

let db: Db;
let seed: PublicSeed;

beforeEach(async () => {
  db = await createTestDb();
  seed = await seedBookable(db, { slug: "studio", pros: 2 });
});

const input = (extra: Partial<{ professionalId: string; date: string }> = {}) => ({
  serviceIds: [seed.serviceIds[0]],
  professionalId: extra.professionalId ?? "any",
  date: extra.date ?? MONDAY,
});

describe("listPublicSlots", () => {
  it("lista os horários do dia no fuso do salão, com o instante em ISO", async () => {
    const slots = await listPublicSlots(db, seed.tenantId, input(), NOW);
    expect(slots).toHaveLength(18);
    expect(slots[0]).toEqual({
      startsAt: local(MONDAY, "09:00").toISOString(),
      time: "09:00",
    });
    expect(slots.at(-1)!.time).toBe("17:30");
  });

  it("respeita a antecedência mínima no próprio dia", async () => {
    // agora = 09:00 local; antecedência 60 min => primeiro horário 10:00
    const slots = await listPublicSlots(db, seed.tenantId, input({ date: "2030-01-01" }), NOW);
    expect(slots[0].time).toBe("10:00");
  });

  it("dia sem expediente (domingo) e fora do prazo máximo: vazio", async () => {
    expect(await listPublicSlots(db, seed.tenantId, input({ date: "2030-01-06" }), NOW)).toEqual([]);
    expect(await listPublicSlots(db, seed.tenantId, input({ date: "2030-03-01" }), NOW)).toEqual([]);
  });

  it("horário ocupado some só para o profissional escolhido", async () => {
    await createBooking(
      db,
      seed.tenantId,
      {
        serviceIds: [seed.serviceIds[0]],
        professionalId: seed.proIds[0],
        startsAt: local(MONDAY, "09:00"),
        customer: { name: "Ana", phone: "(11) 98765-4321" },
        source: "public",
      },
      NOW,
    );
    const first = await listPublicSlots(db, seed.tenantId, input({ professionalId: seed.proIds[0] }), NOW);
    expect(first[0].time).toBe("09:30");
    const second = await listPublicSlots(db, seed.tenantId, input({ professionalId: seed.proIds[1] }), NOW);
    expect(second[0].time).toBe("09:00");
    // "Qualquer": o horário continua livre porque o outro profissional atende.
    expect((await listPublicSlots(db, seed.tenantId, input(), NOW))[0].time).toBe("09:00");
  });

  it("serviço oculto, arquivado ou de outro estabelecimento: invalid_selection", async () => {
    await db.update(services).set({ visible: false }).where(eq(services.id, seed.serviceIds[0]));
    await expect(listPublicSlots(db, seed.tenantId, input(), NOW)).rejects.toMatchObject({
      code: "invalid_selection",
    });
    await db.update(services).set({ visible: true, archivedAt: new Date() }).where(eq(services.id, seed.serviceIds[0]));
    await expect(listPublicSlots(db, seed.tenantId, input(), NOW)).rejects.toBeInstanceOf(BookingError);

    const other = await seedBookable(db, { slug: "outro" });
    await expect(
      listPublicSlots(db, seed.tenantId, { ...input(), serviceIds: [other.serviceIds[0]] }, NOW),
    ).rejects.toMatchObject({ code: "invalid_selection" });
  });

  it("profissional inativo ou de outro estabelecimento: sem horários", async () => {
    await db.update(professionals).set({ active: false }).where(eq(professionals.id, seed.proIds[0]));
    expect(await listPublicSlots(db, seed.tenantId, input({ professionalId: seed.proIds[0] }), NOW)).toEqual([]);
    const other = await seedBookable(db, { slug: "outro" });
    expect(await listPublicSlots(db, seed.tenantId, input({ professionalId: other.proIds[0] }), NOW)).toEqual([]);
  });
});

describe("listPublicDates", () => {
  it("lista as datas com horário até o prazo máximo, sem os domingos", async () => {
    const dates = await listPublicDates(
      db,
      seed.tenantId,
      { serviceIds: [seed.serviceIds[0]], professionalId: "any", from: "2030-01-01" },
      NOW,
    );
    expect(dates[0]).toBe("2030-01-01");
    expect(dates).not.toContain("2030-01-06");
    expect(dates).not.toContain("2030-01-13");
    // maxDaysAhead = 30: 2030-01-31 é o último dia aceito.
    expect(dates.at(-1)).toBe("2030-01-31");
    expect(dates).toContain(MONDAY);
  });

  it("não volta antes de hoje, mesmo que o cliente peça", async () => {
    const dates = await listPublicDates(
      db,
      seed.tenantId,
      { serviceIds: [seed.serviceIds[0]], professionalId: "any", from: "2020-01-01" },
      NOW,
    );
    expect(dates[0]).toBe("2030-01-01");
  });

  it("começa na data pedida e some o dia lotado", async () => {
    // Lota segunda para os dois profissionais: 18 horários cada.
    for (const proId of seed.proIds) {
      for (let i = 0; i < 18; i++) {
        const minutes = 9 * 60 + i * 30;
        const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
        await createBooking(
          db,
          seed.tenantId,
          {
            serviceIds: [seed.serviceIds[0]],
            professionalId: proId,
            startsAt: local(MONDAY, hhmm),
            customer: { name: "Ana", phone: `1198765${String(1000 + i)}` },
            source: "public",
          },
          NOW,
        );
      }
    }
    const dates = await listPublicDates(
      db,
      seed.tenantId,
      { serviceIds: [seed.serviceIds[0]], professionalId: "any", from: "2030-01-05" },
      NOW,
    );
    expect(dates[0]).toBe("2030-01-05");
    expect(dates).not.toContain(MONDAY);
    expect(dates).toContain("2030-01-08");
  }, 120_000);
});
