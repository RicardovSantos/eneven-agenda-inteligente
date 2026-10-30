CREATE TABLE "billing_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"provider_status" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"provider_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_invoices_provider_id_unique" UNIQUE("provider_id"),
	CONSTRAINT "billing_invoices_amount_check" CHECK ("billing_invoices"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "billing_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"provider_id" text,
	"provider_status" text DEFAULT 'pending' NOT NULL,
	"provider_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_subscriptions_provider_id_unique" UNIQUE("provider_id"),
	CONSTRAINT "billing_subscriptions_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_subscription_fk" FOREIGN KEY ("tenant_id","subscription_id") REFERENCES "public"."billing_subscriptions"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_invoices_tenant_idx" ON "billing_invoices" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_tenant_idx" ON "billing_subscriptions" USING btree ("tenant_id","created_at");--> statement-breakpoint
REVOKE ALL ON "billing_subscriptions", "billing_invoices" FROM agenda_app;--> statement-breakpoint
GRANT SELECT ON "billing_subscriptions", "billing_invoices" TO agenda_app;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "billing_subscriptions" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "billing_invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_invoices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "billing_invoices" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
