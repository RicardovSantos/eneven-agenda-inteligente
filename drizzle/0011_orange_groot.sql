ALTER TABLE "whatsapp_messages" ADD COLUMN "queue_id" uuid;--> statement-breakpoint
ALTER TABLE "whatsapp_queue" ADD CONSTRAINT "whatsapp_queue_tenant_id_id_unique" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_queue_fk" FOREIGN KEY ("tenant_id","queue_id") REFERENCES "public"."whatsapp_queue"("tenant_id","id") ON DELETE set null ("queue_id") ON UPDATE no action;
