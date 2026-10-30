CREATE TABLE "push_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"event_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_events_identity_unique" UNIQUE("tenant_id","booking_id","event_type","event_key"),
	CONSTRAINT "push_events_type_check" CHECK ("push_events"."event_type" in ('booking_created', 'booking_canceled', 'booking_rescheduled')),
	CONSTRAINT "push_events_key_length_check" CHECK (length("push_events"."event_key") between 1 and 160)
);
--> statement-breakpoint
ALTER TABLE "push_events" ADD CONSTRAINT "push_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_events" ADD CONSTRAINT "push_events_booking_fk" FOREIGN KEY ("tenant_id","booking_id") REFERENCES "public"."bookings"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "push_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "push_events" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
REVOKE ALL ON "push_events" FROM agenda_app;--> statement-breakpoint
GRANT INSERT ON "push_events" TO agenda_app;
