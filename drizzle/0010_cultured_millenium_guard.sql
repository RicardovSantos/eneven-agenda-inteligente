ALTER TABLE "whatsapp_inbound_events" ADD COLUMN "claimed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_inbound_events" ADD COLUMN "attempts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_inbound_events" ADD COLUMN "payload_encrypted" text;