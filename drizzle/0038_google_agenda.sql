CREATE TABLE "google_calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"google_email" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"calendar_id" text NOT NULL,
	"calendar_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"cursor" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"failures" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_calendar_connections_tenant_user_unique" UNIQUE("tenant_id","user_id"),
	CONSTRAINT "google_calendar_connections_status_check" CHECK ("google_calendar_connections"."status" in ('active', 'needs_reconnect'))
);
--> statement-breakpoint
CREATE TABLE "google_calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"google_event_id" text NOT NULL,
	"synced_updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_calendar_events_connection_booking_unique" UNIQUE("connection_id","booking_id")
);
--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_events" ADD CONSTRAINT "google_calendar_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_events" ADD CONSTRAINT "google_calendar_events_connection_id_google_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "google_calendar_connections_sync_idx" ON "google_calendar_connections" USING btree ("enabled","status");--> statement-breakpoint
CREATE INDEX "google_calendar_events_booking_idx" ON "google_calendar_events" USING btree ("tenant_id","booking_id");--> statement-breakpoint
REVOKE ALL ON "google_calendar_connections" FROM agenda_app;
--> statement-breakpoint
REVOKE ALL ON "google_calendar_events" FROM agenda_app;
