CREATE TABLE "billing_renewal_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'sending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "billing_renewal_notices_tenant_period_unique" UNIQUE("tenant_id","period_end"),
	CONSTRAINT "billing_renewal_notices_state_check" CHECK ("billing_renewal_notices"."state" in ('sending', 'sent', 'uncertain'))
);
--> statement-breakpoint
ALTER TABLE "billing_renewal_notices" ADD CONSTRAINT "billing_renewal_notices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_renewal_notices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_renewal_notices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "billing_renewal_notices" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
REVOKE ALL ON "billing_renewal_notices" FROM agenda_app;
