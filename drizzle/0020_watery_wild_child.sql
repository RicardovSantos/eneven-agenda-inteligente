CREATE TABLE "billing_invoice_payment_links" (
	"payment_id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD COLUMN "invoice_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_invoice_payment_links" ADD CONSTRAINT "billing_invoice_payment_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoice_payment_links" ADD CONSTRAINT "billing_invoice_payment_links_invoice_fk" FOREIGN KEY ("tenant_id","invoice_id") REFERENCES "public"."billing_invoices"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_invoice_payment_links_invoice_idx" ON "billing_invoice_payment_links" USING btree ("tenant_id","invoice_id");--> statement-breakpoint
REVOKE ALL ON "billing_invoice_payment_links" FROM agenda_app;--> statement-breakpoint
GRANT SELECT ON "billing_invoice_payment_links" TO agenda_app;--> statement-breakpoint
ALTER TABLE "billing_invoice_payment_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_invoice_payment_links" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "billing_invoice_payment_links" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
