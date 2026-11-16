import { describe, expect, it } from "vitest";
import { buildPushContent, formatPushWhen, pushContentFor } from "@/server/push/content";
import { bookingServices, customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { seedBooking, seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

describe("texto da notificação", () => {
  it("formata o horário no fuso do estabelecimento", () => {
    // 2026-11-17 13:30 UTC = terça 10:30 em São Paulo
    expect(formatPushWhen(new Date("2026-11-17T13:30:00Z"), "America/Sao_Paulo")).toBe("ter, 17/11 às 10:30");
    expect(formatPushWhen(new Date("2026-11-17T13:30:00Z"), "America/Manaus")).toBe("ter, 17/11 às 09:30");
  });

  it("título por tipo e uma linha com cliente, serviço e horário", () => {
    const booking = { customerName: "Marina Costa", services: ["Corte feminino", "Escova"], startsAt: new Date("2026-11-17T13:30:00Z"), timezone: "America/Sao_Paulo" };
    expect(buildPushContent("booking_created", booking)).toEqual({ title: "Novo agendamento", body: "Marina Costa · Corte feminino + Escova · ter, 17/11 às 10:30" });
    expect(buildPushContent("booking_canceled", booking).title).toBe("Agendamento cancelado");
    expect(buildPushContent("booking_rescheduled", booking).title).toBe("Agendamento remarcado");
  });

  it("corta nome e serviços muito longos e trata nome vazio", () => {
    const long = buildPushContent("booking_created", { customerName: "N".repeat(100), services: ["S".repeat(200)], startsAt: new Date("2026-11-17T13:30:00Z"), timezone: "America/Sao_Paulo" });
    expect(long.body.length).toBeLessThan(140);
    expect(long.body).toContain("…");
    expect(buildPushContent("booking_created", { customerName: "  ", services: [], startsAt: new Date("2026-11-17T13:30:00Z"), timezone: "America/Sao_Paulo" }).body).toBe("Cliente · ter, 17/11 às 10:30");
  });

  it("lê o agendamento do banco; sem ele devolve null", async () => {
    const db = await createTestDb();
    const tenant = await seedTenant(db);
    const booking = await seedBooking(db, tenant.id);
    await db.update(customers).set({ name: "Renata Alves" }).where(eq(customers.id, booking.customerId));
    await db.insert(bookingServices).values({ tenantId: tenant.id, bookingId: booking.id, name: "Designer simples", durationMin: 30, priceCents: 5000, position: 0 });
    const content = await pushContentFor(db, tenant.id, booking.id, "booking_created");
    expect(content?.title).toBe("Novo agendamento");
    expect(content?.body).toContain("Renata Alves · Designer simples ·");
    expect(await pushContentFor(db, tenant.id, "00000000-0000-4000-8000-000000000000", "booking_created")).toBeNull();
  });
});
