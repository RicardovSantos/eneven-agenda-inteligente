CREATE TABLE "trial_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"state" text DEFAULT 'sending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "trial_notices_tenant_kind_unique" UNIQUE("tenant_id","kind"),
	CONSTRAINT "trial_notices_kind_check" CHECK ("trial_notices"."kind" in ('ending', 'ended')),
	CONSTRAINT "trial_notices_state_check" CHECK ("trial_notices"."state" in ('sending', 'sent', 'uncertain'))
);
--> statement-breakpoint
ALTER TABLE "trial_notices" ADD CONSTRAINT "trial_notices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_notices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trial_notices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "trial_notices" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
REVOKE ALL ON "trial_notices" FROM agenda_app;
