import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  tenantNotificationSettings,
  bookingManageTokens,
  whatsappInboundEvents,
  whatsappMessages,
} from "@/db/schema";
import { withTenant } from "@/server/tenant-db";
import { seedBooking, seedTenant } from "../helpers/agenda-fixtures";
import {
  expectEveryAgendaAppTableHasRls,
  expectRlsViolation,
  failure,
} from "../helpers/db-assertions";
import { connectPg } from "./pg-db";

const pg = connectPg();
const { db } = pg;

beforeEach(async () => {
  await pg.truncate();
});

afterAll(async () => {
  await pg.close();
});

describe("Plano 4 (PostgreSQL real) - Esquema e RLS do WhatsApp", () => {
  it("todas as tabelas novas possuem RLS ativo e forçado no PostgreSQL real", async () => {
    await expectEveryAgendaAppTableHasRls(db);
  });

  it("garante isolamento estrito via RLS entre estabelecimentos no Postgres real", async () => {
    const a = await seedTenant(db, "pg-notif-a");
    const b = await seedTenant(db, "pg-notif-b");

    await withTenant(db, a.id, async (tx) => {
      await tx.insert(tenantNotificationSettings).values({
        tenantId: a.id,
        reminder2h: true,
      });
      await tx.insert(whatsappMessages).values({
        tenantId: a.id,
        recipientPhone: "5511999990001",
      });
    });

    // B não enxerga nada de A
    const notifsB = await withTenant(db, b.id, (tx) =>
      tx.select().from(tenantNotificationSettings),
    );
    expect(notifsB).toHaveLength(0);

    const msgsB = await withTenant(db, b.id, (tx) =>
      tx.select().from(whatsappMessages),
    );
    expect(msgsB).toHaveLength(0);

    // B não consegue inserir no tenant A
    const err = await failure(
      withTenant(db, b.id, (tx) =>
        tx.insert(whatsappMessages).values({
          tenantId: a.id,
          recipientPhone: "5511999990002",
        }),
      ),
    );
    expectRlsViolation(err);
  });

  it("isola tokens adicionais e impede acesso do papel de tenant ao registro global", async () => {
    const a = await seedTenant(db, "pg-token-a");
    const b = await seedTenant(db, "pg-token-b");
    const booking = await seedBooking(db, a.id);
    await withTenant(db, a.id, (tx) => tx.insert(bookingManageTokens).values({
      tokenHash: "token-hash", tenantId: a.id, bookingId: booking.id, expiresAt: new Date(Date.now() + 60_000),
    }));
    expect(await withTenant(db, b.id, (tx) => tx.select().from(bookingManageTokens))).toHaveLength(0);
    const err = await failure(withTenant(db, b.id, (tx) => tx.select().from(whatsappInboundEvents)));
    expect(err).not.toBeNull();
  });

  it("aceita apenas uma reivindicação concorrente do mesmo evento da Meta", async () => {
    const eventId = `wamid.pg.${Date.now()}`;
    const claims = await Promise.all(Array.from({ length: 5 }, () =>
      db.insert(whatsappInboundEvents).values({ id: eventId }).onConflictDoNothing().returning({ id: whatsappInboundEvents.id }),
    ));
    expect(claims.flat()).toHaveLength(1);
  });
});
