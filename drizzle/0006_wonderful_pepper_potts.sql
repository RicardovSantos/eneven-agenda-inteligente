CREATE TYPE "public"."whatsapp_message_status" AS ENUM('queued', 'sending', 'sent', 'delivered', 'read', 'failed');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_template_type" AS ENUM('booking_created', 'reminder_eve', 'reminder_2h', 'rescheduled', 'canceled');--> statement-breakpoint
CREATE TABLE "tenant_notification_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"booking_created" boolean DEFAULT true NOT NULL,
	"reminder_eve" boolean DEFAULT true NOT NULL,
	"reminder_2h" boolean DEFAULT false NOT NULL,
	"rescheduled" boolean DEFAULT true NOT NULL,
	"canceled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"booking_id" uuid,
	"direction" text DEFAULT 'outbound' NOT NULL,
	"template_type" "whatsapp_template_type",
	"recipient_phone" text NOT NULL,
	"recipient_name" text,
	"wam_id" text,
	"status" "whatsapp_message_status" DEFAULT 'queued' NOT NULL,
	"failure_code" text,
	"failure_reason" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_messages_wam_id_unique" UNIQUE("wam_id"),
	CONSTRAINT "whatsapp_messages_direction_check" CHECK ("whatsapp_messages"."direction" in ('outbound', 'inbound'))
);
--> statement-breakpoint
CREATE TABLE "whatsapp_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"template_type" "whatsapp_template_type" NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_queue_tenant_booking_template_unique" UNIQUE("tenant_id","booking_id","template_type")
);
--> statement-breakpoint
ALTER TABLE "tenant_notification_settings" ADD CONSTRAINT "tenant_notification_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_booking_fk" FOREIGN KEY ("tenant_id","booking_id") REFERENCES "public"."bookings"("tenant_id","id") ON DELETE set null ("booking_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_queue" ADD CONSTRAINT "whatsapp_queue_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_queue" ADD CONSTRAINT "whatsapp_queue_booking_fk" FOREIGN KEY ("tenant_id","booking_id") REFERENCES "public"."bookings"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_messages_tenant_created_idx" ON "whatsapp_messages" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_wam_id_idx" ON "whatsapp_messages" USING btree ("wam_id");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_phone_created_idx" ON "whatsapp_messages" USING btree ("recipient_phone","created_at");--> statement-breakpoint
CREATE INDEX "whatsapp_queue_due_idx" ON "whatsapp_queue" USING btree ("scheduled_for","processed_at","locked_until");--> statement-breakpoint
ALTER TABLE "tenant_notification_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_notification_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tenant_notification_settings"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "whatsapp_messages"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "whatsapp_queue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "whatsapp_queue" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "whatsapp_queue"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);