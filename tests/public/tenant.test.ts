import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { professionals, services, tenants, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { getPublicCatalog, getPublicTenant } from "@/server/public/tenant";
import { createTestDb } from "../helpers/test-db";
import { seedBookable } from "../helpers/public-fixtures";

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

const NOW = new Date("2026-10-25T12:00:00.000Z");

describe("getPublicTenant", () => {
  it("slug inexistente, inválido ou reservado: null", async () => {
    await seedBookable(db, { slug: "studio" });
    expect(await getPublicTenant("nao-existe", { db, now: NOW })).toBeNull();
    expect(await getPublicTenant("painel", { db, now: NOW })).toBeNull();
    expect(await getPublicTenant("agendamento", { db, now: NOW })).toBeNull();
    expect(await getPublicTenant("favicon.ico", { db, now: NOW })).toBeNull();
    expect(await getPublicTenant("", { db, now: NOW })).toBeNull();
  });

  it("estabelecimento pronto: canBook, com os dados públicos e a cor legível", async () => {
    const seed = await seedBookable(db, {
      slug: "studio",
      tenant: { brandColor: "#FFD000", whatsapp: "5511987654321", address: "Rua X, 120" },
    });
    const result = await getPublicTenant("studio", { db, now: NOW });
    expect(result).not.toBeNull();
    expect(result!.canBook).toBe(true);
    expect(result!.reason).toBeUndefined();
    expect(result!.tenant).toMatchObject({
      id: seed.tenantId,
      slug: "studio",
      name: "Studio Defendi",
      whatsapp: "5511987654321",
      address: "Rua X, 120",
    });
    // Amarelo não dá contraste com branco: escurecido para a leitura.
    expect(result!.tenant.brandColor).not.toBe("#FFD000");
    // Sem cor definida usa o roxo da marca Eneven.
    await db.update(tenants).set({ brandColor: null }).where(eq(tenants.id, seed.tenantId));
    expect((await getPublicTenant("studio", { db, now: NOW }))!.tenant.brandColor).toBe("#3E07D2");
  });

  it("ignora maiúsculas no slug", async () => {
    await seedBookable(db, { slug: "studio" });
    expect((await getPublicTenant("Studio", { db, now: NOW }))?.tenant.slug).toBe("studio");
  });

  it("motivo email_unverified: e-mail do dono não confirmado", async () => {
    await seedBookable(db, { slug: "studio", verified: false });
    const result = await getPublicTenant("studio", { db, now: NOW });
    expect(result).toMatchObject({ canBook: false, reason: "email_unverified" });
    expect(result!.tenant.name).toBe("Studio Defendi");
  });

  it("motivo inactive: teste vencido, somente leitura, em atraso ou cancelado", async () => {
    const expired = await seedBookable(db, {
      slug: "vencido",
      trialEndsAt: new Date("2026-10-24T12:00:00.000Z"),
    });
    expect(await getPublicTenant("vencido", { db, now: NOW })).toMatchObject({
      canBook: false,
      reason: "inactive",
    });
    // Dentro do prazo volta a aceitar.
    await db
      .update(tenants)
      .set({ trialEndsAt: new Date("2026-10-26T12:00:00.000Z") })
      .where(eq(tenants.id, expired.tenantId));
    expect((await getPublicTenant("vencido", { db, now: NOW }))!.canBook).toBe(true);

    for (const status of ["read_only", "past_due", "canceled"] as const) {
      await seedBookable(db, { slug: `s-${status.replace("_", "-")}`, status });
      expect(await getPublicTenant(`s-${status.replace("_", "-")}`, { db, now: NOW })).toMatchObject({
        canBook: false,
        reason: "inactive",
      });
    }
  });

  it("status active aceita mesmo com o período de teste vencido", async () => {
    await seedBookable(db, {
      slug: "pago",
      status: "active",
      trialEndsAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect((await getPublicTenant("pago", { db, now: NOW }))!.canBook).toBe(true);
  });

  it("mantém link público durante a carência e bloqueia ao vencê-la", async () => {
    const seed = await seedBookable(db, { slug: "carencia" });
    const due = new Date(NOW.getTime() - 7 * 86_400_000 + 1);
    await db.update(tenants).set({ status: "past_due", pastDueAt: due }).where(eq(tenants.id, seed.tenantId));
    expect((await getPublicTenant("carencia", { db, now: NOW }))?.canBook).toBe(true);
    expect((await getPublicTenant("carencia", { db, now: new Date(NOW.getTime() + 1) }))?.canBook).toBe(false);
  });

  it("motivo no_services: sem serviço visível com profissional ativo", async () => {
    const seed = await seedBookable(db, { slug: "studio" });
    // serviço oculto
    await db.update(services).set({ visible: false }).where(eq(services.tenantId, seed.tenantId));
    expect(await getPublicTenant("studio", { db, now: NOW })).toMatchObject({
      canBook: false,
      reason: "no_services",
    });
    // serviço arquivado
    await db
      .update(services)
      .set({ visible: true, archivedAt: new Date() })
      .where(eq(services.tenantId, seed.tenantId));
    expect((await getPublicTenant("studio", { db, now: NOW }))!.reason).toBe("no_services");
    // visível, mas nenhum profissional ativo
    await db.update(services).set({ archivedAt: null }).where(eq(services.tenantId, seed.tenantId));
    await db.update(professionals).set({ active: false }).where(eq(professionals.tenantId, seed.tenantId));
    expect((await getPublicTenant("studio", { db, now: NOW }))!.reason).toBe("no_services");
  });

  it("e-mail não confirmado tem prioridade sobre os outros motivos", async () => {
    await seedBookable(db, { slug: "studio", verified: false, status: "canceled" });
    expect((await getPublicTenant("studio", { db, now: NOW }))!.reason).toBe("email_unverified");
  });

  it("só dono com e-mail confirmado conta", async () => {
    const seed = await seedBookable(db, { slug: "studio" });
    await db.update(users).set({ emailVerifiedAt: null }).where(eq(users.id, seed.ownerId));
    expect((await getPublicTenant("studio", { db, now: NOW }))!.reason).toBe("email_unverified");
  });
});

describe("getPublicCatalog", () => {
  it("lista só serviços visíveis, não arquivados e com profissional ativo que o faz", async () => {
    const seed = await seedBookable(db, { slug: "studio", servicesCount: 3, pros: 2 });
    const [a, b, c] = seed.serviceIds;
    await db.update(services).set({ visible: false }).where(eq(services.id, b));
    await db.update(services).set({ archivedAt: new Date() }).where(eq(services.id, c));
    await db.update(professionals).set({ active: false }).where(eq(professionals.id, seed.proIds[1]));

    const catalog = await getPublicCatalog(db, seed.tenantId);
    expect(catalog.services.map((s) => s.id)).toEqual([a]);
    expect(catalog.services[0]).toMatchObject({
      name: "Corte",
      durationMin: 30,
      priceCents: 9000,
      professionalIds: [seed.proIds[0]],
    });
    expect(catalog.professionals.map((p) => p.id)).toEqual([seed.proIds[0]]);
  });
});
