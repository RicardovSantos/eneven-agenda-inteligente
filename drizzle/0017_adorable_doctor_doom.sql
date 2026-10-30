CREATE TABLE "billing_webhook_events" (
	"request_id" text PRIMARY KEY NOT NULL,
	"resource_id" text NOT NULL,
	"topic" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "billing_webhook_events_topic_check" CHECK ("billing_webhook_events"."topic" in ('payment', 'subscription_preapproval', 'subscription_authorized_payment'))
);
--> statement-breakpoint
CREATE INDEX "billing_webhook_events_pending_idx" ON "billing_webhook_events" USING btree ("processed_at","received_at");--> statement-breakpoint
REVOKE ALL ON "billing_webhook_events" FROM agenda_app;
