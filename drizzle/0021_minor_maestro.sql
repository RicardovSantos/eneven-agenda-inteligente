CREATE TABLE "billing_payment_attempts" (
	"payment_id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"status" text NOT NULL,
	"provider_updated_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "billing_payment_attempts" ADD CONSTRAINT "billing_payment_attempts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_tenant_id_id_unique" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "billing_payment_attempts" ADD CONSTRAINT "billing_payment_attempts_invoice_fk" FOREIGN KEY ("tenant_id","invoice_id") REFERENCES "public"."billing_invoices"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_payment_attempts_invoice_idx" ON "billing_payment_attempts" USING btree ("tenant_id","invoice_id");--> statement-breakpoint
INSERT INTO "billing_payment_attempts" ("payment_id", "tenant_id", "invoice_id", "status", "provider_updated_at", "paid_at")
SELECT "payment_id", "tenant_id", "id", "provider_status", coalesce("provider_updated_at", "created_at"), "paid_at" FROM "billing_invoices" WHERE "payment_id" IS NOT NULL;--> statement-breakpoint
REVOKE ALL ON "billing_payment_attempts" FROM agenda_app;--> statement-breakpoint
GRANT SELECT ON "billing_payment_attempts" TO agenda_app;--> statement-breakpoint
ALTER TABLE "billing_payment_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_payment_attempts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "billing_payment_attempts" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
