CREATE TABLE "professional_photos" (
	"tenant_id" uuid NOT NULL,
	"professional_id" uuid NOT NULL,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "professional_photos_pk" PRIMARY KEY("tenant_id","professional_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_photos" (
	"tenant_id" uuid NOT NULL,
	"slot" smallint NOT NULL,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_photos_pk" PRIMARY KEY("tenant_id","slot"),
	CONSTRAINT "tenant_photos_slot_range" CHECK ("tenant_photos"."slot" between 0 and 2)
);
--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "photo_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "facebook" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "hero_title" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "hero_subtitle" text;--> statement-breakpoint
ALTER TABLE "professional_photos" ADD CONSTRAINT "professional_photos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_photos" ADD CONSTRAINT "professional_photos_professional_fk" FOREIGN KEY ("tenant_id","professional_id") REFERENCES "public"."professionals"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_photos" ADD CONSTRAINT "tenant_photos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_photos" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tenant_photos" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "professional_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "professional_photos" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "professional_photos" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
