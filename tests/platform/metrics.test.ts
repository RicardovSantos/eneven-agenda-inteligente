import { describe, expect, it } from "vitest";
import { bookings } from "@/db/schema";
import { getPlatformMetrics } from "@/server/platform/metrics";
import { bookingValues, seedCustomer, seedProfessional } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";
import { DAY, NOW, seedPlatformTenant } from "../helpers/platform-fixtures";

describe("getPlatformMetrics", () => {
  it("MRR, ativos, testes, conversão e agendamentos", async () => {
    const db = await createTestDb();
    const past = new Date(NOW.getTime() - DAY);
    const a = await seedPlatformTenant(db, { status: "active", plan: "essencial", activatedAt: past });
    await seedPlatformTenant(db, { status: "active", plan: "essencial", activatedAt: past });
    await seedPlatformTenant(db, { status: "active", plan: "studio", activatedAt: past });
    // dois testes terminados sem ativar
    await seedPlatformTenant(db, { status: "read_only", trialEndsAt: past });
    await seedPlatformTenant(db, { status: "trial", trialEndsAt: past });
    // testes em andamento (um termina em 3 dias, outro em 20)
    await seedPlatformTenant(db, { trialEndsAt: new Date(NOW.getTime() + 3 * DAY) });
    await seedPlatformTenant(db, { trialEndsAt: new Date(NOW.getTime() + 20 * DAY) });

    const pro = await seedProfessional(db, a.tenant.id);
    const cus = await seedCustomer(db, a.tenant.id);
    const mk = (days: number, source: "public" | "panel", status: "scheduled" | "canceled" = "scheduled") => {
      const start = new Date(NOW.getTime() - days * DAY);
      const end = new Date(start.getTime() + 1_800_000);
      return db
        .insert(bookings)
        .values(bookingValues(a.tenant.id, pro.id, cus.id, { startsAt: start, endsAt: end, blockedUntil: end, source, status }));
    };
    await mk(1, "public");
    await mk(2, "public");
    await mk(3, "panel");
    await mk(4, "public", "canceled"); // cancelado não conta
    await mk(40, "panel"); // fora de 30 dias

    const m = await getPlatformMetrics(db, NOW);
    expect(m.mrrCents).toBe(18970);
    expect(m.activeCount).toBe(3);
    expect(m.trialCount).toBe(2);
    expect(m.trialEndingIn7Days).toBe(1);
    expect(m.conversion).toEqual({ converted: 3, finished: 5, rate: 0.6 });
    expect(m.bookings30d).toBe(3);
    expect(m.publicShare).toBeCloseTo(2 / 3);
  });

  it("sem dados: taxas nulas", async () => {
    const db = await createTestDb();
    const m = await getPlatformMetrics(db, NOW);
    expect(m).toMatchObject({ mrrCents: 0, activeCount: 0, bookings30d: 0, publicShare: null });
    expect(m.conversion).toEqual({ converted: 0, finished: 0, rate: null });
  });
});
