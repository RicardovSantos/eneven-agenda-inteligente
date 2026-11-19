CREATE TABLE "deleted_tenant_billing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_ref" uuid NOT NULL,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"resource_id" text NOT NULL,
	"amount_cents" integer,
	"paid_at" timestamp with time zone,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deleted_tenant_billing_provider_check" CHECK ("deleted_tenant_billing"."provider" in ('mercadopago', 'stripe')),
	CONSTRAINT "deleted_tenant_billing_kind_check" CHECK ("deleted_tenant_billing"."kind" in ('subscription', 'invoice', 'payment', 'charge'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "deleted_tenant_billing_unique" ON "deleted_tenant_billing" USING btree ("provider","kind","resource_id");--> statement-breakpoint
CREATE INDEX "deleted_tenant_billing_resource_idx" ON "deleted_tenant_billing" USING btree ("provider","resource_id");--> statement-breakpoint
CREATE INDEX "deleted_tenant_billing_paid_idx" ON "deleted_tenant_billing" USING btree ("paid_at");--> statement-breakpoint
REVOKE ALL ON "deleted_tenant_billing" FROM agenda_app;
