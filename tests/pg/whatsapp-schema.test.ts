import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  tenantNotificationSettings,
  whatsappMessages,
} from "@/db/schema";
import { withTenant } from "@/server/tenant-db";
import { seedTenant } from "../helpers/agenda-fixtures";
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
});
