CREATE TABLE "billing_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"method" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'creating' NOT NULL,
	"provider_payment_id" text,
	"qr_code" text,
	"qr_code_base64" text,
	"ticket_url" text,
	"barcode" text,
	"expires_at" timestamp with time zone,
	"provider_updated_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_charges_provider_payment_id_unique" UNIQUE("provider_payment_id"),
	CONSTRAINT "billing_charges_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "billing_charges_method_check" CHECK ("billing_charges"."method" in ('pix', 'boleto')),
	CONSTRAINT "billing_charges_status_check" CHECK ("billing_charges"."status" in ('creating', 'uncertain', 'pending', 'approved', 'expired', 'cancelled', 'refunded', 'charged_back')),
	CONSTRAINT "billing_charges_amount_check" CHECK ("billing_charges"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "paid_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_charges" ADD CONSTRAINT "billing_charges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_charges" ADD CONSTRAINT "billing_charges_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_charges_tenant_idx" ON "billing_charges" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_charges_one_open_idx" ON "billing_charges" USING btree ("tenant_id") WHERE "billing_charges"."status" in ('creating', 'uncertain', 'pending');--> statement-breakpoint
REVOKE ALL ON "billing_charges" FROM agenda_app;--> statement-breakpoint
GRANT SELECT ON "billing_charges" TO agenda_app;--> statement-breakpoint
ALTER TABLE "billing_charges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_charges" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "billing_charges" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
