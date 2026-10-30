ALTER TABLE "billing_invoices" ADD COLUMN "payment_id" text;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_payment_id_unique" UNIQUE("payment_id");