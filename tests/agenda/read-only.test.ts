import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { BookingError, createBooking } from "@/server/agenda/bookings";
import {
  cancelBookingAsStaff,
  completeBooking,
  createBlock,
  createPanelBooking,
  rescheduleBookingAsStaff,
  type PanelActor,
} from "@/server/agenda/panel-ops";
import { createTestDb } from "../helpers/test-db";
import { seedBookable, type PublicSeed } from "../helpers/public-fixtures";

const local = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00.000-03:00`);
const NOW = new Date("2030-01-01T12:00:00.000Z");

let db: Db;
let seed: PublicSeed;
let actor: PanelActor;

async function expectReadOnly(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(BookingError);
    expect((error as BookingError).code).toBe("read_only");
    expect((error as BookingError).message).toBe("Sua agenda está em modo somente leitura.");
    return;
  }
  throw new Error("esperava read_only");
}

beforeEach(async () => {
  db = await createTestDb();
  seed = await seedBookable(db, { pros: 1 });
  actor = { tenantId: seed.tenantId, userId: seed.ownerId, role: "owner" };
});

const panelInput = (hhmm: string) => ({
  serviceIds: [seed.serviceIds[0]],
  professionalId: seed.proIds[0],
  startsAt: local("2030-01-07", hhmm).toISOString(),
  name: "Ana",
  phone: "(11) 98765-4321",
});

describe("modo somente leitura", () => {
  it("tenant ativo agenda normalmente", async () => {
    await createPanelBooking(db, actor, panelInput("10:00"), NOW);
  });

  it("read_only bloqueia criar, remarcar e bloquear horário; cancelar e concluir continuam", async () => {
    const { bookingId } = await createPanelBooking(db, actor, panelInput("10:00"), NOW);
    const { bookingId: second } = await createPanelBooking(db, actor, panelInput("14:00"), NOW);
    await db.update(tenants).set({ status: "read_only" }).where(eq(tenants.id, seed.tenantId));

    await expectReadOnly(createPanelBooking(db, actor, panelInput("11:00"), NOW));
    await expectReadOnly(
      rescheduleBookingAsStaff(db, actor, bookingId, local("2030-01-07", "12:00").toISOString(), undefined, NOW),
    );
    await expectReadOnly(
      createBlock(db, actor, {
        professionalId: null,
        startsAt: local("2030-01-08", "10:00").toISOString(),
        endsAt: local("2030-01-08", "11:00").toISOString(),
        reason: null,
      }),
    );

    await completeBooking(db, actor, second);
    const result = await cancelBookingAsStaff(db, actor, bookingId, NOW);
    expect(result.whatsappUrl).toContain("wa.me");
  });

  it("teste vencido também é somente leitura", async () => {
    await db
      .update(tenants)
      .set({ trialEndsAt: new Date("2029-12-01T00:00:00Z") })
      .where(eq(tenants.id, seed.tenantId));
    await expectReadOnly(createPanelBooking(db, actor, panelInput("10:00"), NOW));
  });

  it("permite agendar durante a carência e bloqueia ao completar sete dias", async () => {
    const due = new Date(NOW.getTime() - 7 * 86_400_000 + 1);
    await db.update(tenants).set({ status: "past_due", pastDueAt: due }).where(eq(tenants.id, seed.tenantId));
    await createPanelBooking(db, actor, panelInput("10:00"), NOW);
    await expectReadOnly(createPanelBooking(db, actor, panelInput("11:00"), new Date(NOW.getTime() + 1)));
  });

  it("a reserva online não muda (usa o canBook da página pública)", async () => {
    // createBooking direto (caminho público) continua sem a regra de somente leitura
    await db.update(tenants).set({ status: "read_only" }).where(eq(tenants.id, seed.tenantId));
    await createBooking(
      db,
      seed.tenantId,
      {
        serviceIds: [seed.serviceIds[0]],
        professionalId: seed.proIds[0],
        startsAt: local("2030-01-07", "10:00"),
        customer: { name: "Ana", phone: "(11) 98765-4321" },
        source: "public",
      },
      NOW,
    );
  });
});
