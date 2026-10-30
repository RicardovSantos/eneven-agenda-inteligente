CREATE TABLE "booking_manage_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_manage_tokens" ADD CONSTRAINT "booking_manage_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_manage_tokens" ADD CONSTRAINT "booking_manage_tokens_booking_fk" FOREIGN KEY ("tenant_id","booking_id") REFERENCES "public"."bookings"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_manage_tokens_booking_idx" ON "booking_manage_tokens" USING btree ("tenant_id","booking_id");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "booking_manage_tokens" TO agenda_app;
--> statement-breakpoint
ALTER TABLE "booking_manage_tokens" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking_manage_tokens" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "booking_manage_tokens"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
