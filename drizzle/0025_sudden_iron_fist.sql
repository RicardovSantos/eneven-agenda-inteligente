CREATE TABLE "billing_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"past_due_at" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'sending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "billing_notices_tenant_due_unique" UNIQUE("tenant_id","past_due_at"),
	CONSTRAINT "billing_notices_state_check" CHECK ("billing_notices"."state" in ('sending', 'sent', 'uncertain'))
);
--> statement-breakpoint
ALTER TABLE "billing_notices" ADD CONSTRAINT "billing_notices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_notices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_notices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "billing_notices" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
REVOKE ALL ON "billing_notices" FROM agenda_app;
