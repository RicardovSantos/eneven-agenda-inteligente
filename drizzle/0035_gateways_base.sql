CREATE TABLE "payment_gateway_settings" (
	"method" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'mercadopago' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "payment_gateway_settings_method_check" CHECK ("payment_gateway_settings"."method" in ('card', 'pix', 'boleto')),
	CONSTRAINT "payment_gateway_settings_provider_check" CHECK ("payment_gateway_settings"."provider" in ('mercadopago', 'stripe'))
);
--> statement-breakpoint
ALTER TABLE "billing_webhook_events" DROP CONSTRAINT "billing_webhook_events_topic_check";--> statement-breakpoint
ALTER TABLE "billing_charges" ADD COLUMN "provider" text DEFAULT 'mercadopago' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD COLUMN "provider" text DEFAULT 'mercadopago' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD COLUMN "provider_customer_id" text;--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ADD COLUMN "provider" text DEFAULT 'mercadopago' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_gateway_settings" ADD CONSTRAINT "payment_gateway_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_webhook_events_provider_request_unique" ON "billing_webhook_events" USING btree ("provider","request_id");--> statement-breakpoint
ALTER TABLE "billing_charges" ADD CONSTRAINT "billing_charges_provider_check" CHECK ("billing_charges"."provider" in ('mercadopago', 'stripe'));--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_provider_check" CHECK ("billing_subscriptions"."provider" in ('mercadopago', 'stripe'));--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ADD CONSTRAINT "billing_webhook_events_provider_check" CHECK ("billing_webhook_events"."provider" in ('mercadopago', 'stripe'));--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ADD CONSTRAINT "billing_webhook_events_topic_check" CHECK ("billing_webhook_events"."topic" in ('payment', 'subscription_preapproval', 'subscription_authorized_payment', 'stripe_event'));--> statement-breakpoint
REVOKE ALL ON "payment_gateway_settings" FROM agenda_app;--> statement-breakpoint
INSERT INTO "payment_gateway_settings" ("method", "provider") VALUES ('card', 'mercadopago'), ('pix', 'mercadopago'), ('boleto', 'mercadopago') ON CONFLICT ("method") DO NOTHING;
