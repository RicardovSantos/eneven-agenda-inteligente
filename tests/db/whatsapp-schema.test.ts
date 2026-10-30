import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  tenantNotificationSettings,
  whatsappMessages,
  whatsappQueue,
  bookings,
} from "@/db/schema";
import { withTenant } from "@/server/tenant-db";
import { seedBooking, seedTenant } from "../helpers/agenda-fixtures";
import {
  expectEveryAgendaAppTableHasRls,
  expectRlsViolation,
  failure,
} from "../helpers/db-assertions";
import { createTestDb } from "../helpers/test-db";

describe("Plano 4 - Esquema do WhatsApp e Notificações", () => {
  it("todas as tabelas novas de tenant possuem RLS habilitado e forçado", async () => {
    const db = await createTestDb();
    await expectEveryAgendaAppTableHasRls(db);
  });

  describe("tenant_notification_settings", () => {
    it("insere configurações padrão para o tenant", async () => {
      const db = await createTestDb();
      const tenant = await seedTenant(db, "notif-tenant");

      await withTenant(db, tenant.id, async (tx) => {
        await tx.insert(tenantNotificationSettings).values({
          tenantId: tenant.id,
        });
      });

      const [row] = await withTenant(db, tenant.id, (tx) =>
        tx
          .select()
          .from(tenantNotificationSettings)
          .where(eq(tenantNotificationSettings.tenantId, tenant.id)),
      );

      expect(row).toBeDefined();
      expect(row.bookingCreated).toBe(true);
      expect(row.reminderEve).toBe(true);
      expect(row.reminder2h).toBe(false);
      expect(row.rescheduled).toBe(true);
      expect(row.canceled).toBe(true);
    });

    it("isola por tenant via RLS", async () => {
      const db = await createTestDb();
      const a = await seedTenant(db, "tenant-a-notif");
      const b = await seedTenant(db, "tenant-b-notif");

      await withTenant(db, a.id, async (tx) => {
        await tx.insert(tenantNotificationSettings).values({
          tenantId: a.id,
          reminder2h: true,
        });
      });

      // Tenant B não enxerga as configurações de A
      const rowsSeenByB = await withTenant(db, b.id, (tx) =>
        tx.select().from(tenantNotificationSettings),
      );
      expect(rowsSeenByB).toHaveLength(0);

      // Tenant B não consegue alterar configurações de A
      const err = await failure(
        withTenant(db, b.id, (tx) =>
          tx.insert(tenantNotificationSettings).values({
            tenantId: a.id,
          }),
        ),
      );
      expectRlsViolation(err);
    });
  });

  describe("whatsapp_messages", () => {
    it("insere mensagem com status padrão queued e wamId único", async () => {
      const db = await createTestDb();
      const tenant = await seedTenant(db, "msg-tenant");
      const booking = await seedBooking(db, tenant.id);

      await withTenant(db, tenant.id, async (tx) => {
        await tx.insert(whatsappMessages).values({
          tenantId: tenant.id,
          bookingId: booking.id,
          recipientPhone: "5511999998888",
          recipientName: "Maria",
          templateType: "booking_created",
          wamId: "wamid.HBgLMTIz",
        });
      });

      const [msg] = await withTenant(db, tenant.id, (tx) =>
        tx.select().from(whatsappMessages),
      );
      expect(msg.status).toBe("queued");
      expect(msg.direction).toBe("outbound");
      expect(msg.wamId).toBe("wamid.HBgLMTIz");

      // wamId duplicado deve falhar
      const err = await failure(
        withTenant(db, tenant.id, (tx) =>
          tx.insert(whatsappMessages).values({
            tenantId: tenant.id,
            recipientPhone: "5511999998888",
            wamId: "wamid.HBgLMTIz",
          }),
        ),
      );
      expect(err).not.toBeNull();
    });

    it("isola mensagens por tenant via RLS", async () => {
      const db = await createTestDb();
      const a = await seedTenant(db, "msg-a");
      const b = await seedTenant(db, "msg-b");

      await withTenant(db, a.id, async (tx) => {
        await tx.insert(whatsappMessages).values({
          tenantId: a.id,
          recipientPhone: "5511999991111",
        });
      });

      const rowsSeenByB = await withTenant(db, b.id, (tx) =>
        tx.select().from(whatsappMessages),
      );
      expect(rowsSeenByB).toHaveLength(0);
    });
  });

  describe("whatsapp_queue", () => {
    it("impede enfileirar a mesma mensagem duas vezes para o mesmo agendamento e template", async () => {
      const db = await createTestDb();
      const tenant = await seedTenant(db, "queue-tenant");
      const booking = await seedBooking(db, tenant.id);
      const scheduledFor = new Date(Date.now() + 3600_000);

      await withTenant(db, tenant.id, async (tx) => {
        await tx.insert(whatsappQueue).values({
          tenantId: tenant.id,
          bookingId: booking.id,
          templateType: "reminder_eve",
          eventKey: "booking-v1",
          scheduledFor,
        });
      });

      // Repetição do mesmo evento falha; um evento novo pode usar o mesmo template.
      const err = await failure(
        withTenant(db, tenant.id, (tx) =>
          tx.insert(whatsappQueue).values({
            tenantId: tenant.id,
            bookingId: booking.id,
            templateType: "reminder_eve",
            eventKey: "booking-v1",
            scheduledFor,
          }),
        ),
      );
      expect(err).not.toBeNull();
      await withTenant(db, tenant.id, (tx) => tx.insert(whatsappQueue).values({
        tenantId: tenant.id, bookingId: booking.id, templateType: "reminder_eve",
        eventKey: "booking-v2", scheduledFor,
      }));
    });

    it("exclui itens da fila em cascata quando o agendamento é excluído", async () => {
      const db = await createTestDb();
      const tenant = await seedTenant(db, "cascade-tenant");
      const booking = await seedBooking(db, tenant.id);

      await withTenant(db, tenant.id, async (tx) => {
        await tx.insert(whatsappQueue).values({
          tenantId: tenant.id,
          bookingId: booking.id,
          templateType: "reminder_eve",
          eventKey: "booking-v1",
          scheduledFor: new Date(),
        });
      });

      // Exclui o agendamento
      await withTenant(db, tenant.id, (tx) =>
        tx.delete(bookings).where(eq(bookings.id, booking.id)),
      );

      const queueItems = await withTenant(db, tenant.id, (tx) =>
        tx.select().from(whatsappQueue),
      );
      expect(queueItems).toHaveLength(0);
    });
  });
});
