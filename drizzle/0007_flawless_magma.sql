ALTER TABLE "whatsapp_queue" DROP CONSTRAINT "whatsapp_queue_tenant_booking_template_unique";--> statement-breakpoint
ALTER TABLE "whatsapp_queue" ADD COLUMN "event_key" text;--> statement-breakpoint
UPDATE "whatsapp_queue" SET "event_key" = 'legacy:' || "id"::text;--> statement-breakpoint
ALTER TABLE "whatsapp_queue" ALTER COLUMN "event_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_queue" ADD CONSTRAINT "whatsapp_queue_tenant_booking_template_event_unique" UNIQUE("tenant_id","booking_id","template_type","event_key");
