CREATE TABLE "whatsapp_inbound_events" (
	"id" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'processing' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "whatsapp_inbound_event_state_check" CHECK ("whatsapp_inbound_events"."state" in ('processing', 'completed', 'uncertain'))
);
--> statement-breakpoint
REVOKE ALL ON "whatsapp_inbound_events" FROM agenda_app;
