-- AJUSTES À MÃO sobre o SQL gerado (se esta migração for regerada, repita):
--  1. tenants.plan_id nasce NULO aqui; 0005_plano3.sql semeia os planos, preenche
--     com o Essencial e aplica SET NOT NULL (o schema.ts descreve o estado final).
--  2. invitations_professional_fk usa ON DELETE SET NULL ("professional_id")
--     (PostgreSQL 15+): o padrão anularia também tenant_id (NOT NULL).
CREATE TYPE "public"."invitation_role" AS ENUM('owner', 'reception', 'staff');--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "invitation_role" NOT NULL,
	"professional_id" uuid,
	"token_hash" text NOT NULL,
	"invited_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitations_email_lowercase" CHECK ("invitations"."email" = lower("invitations"."email"))
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"max_professionals" integer,
	"monthly_messages" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "support_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_professional_fk" FOREIGN KEY ("tenant_id","professional_id") REFERENCES "public"."professionals"("tenant_id","id") ON DELETE set null ("professional_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitations_tenant_email_idx" ON "invitations" USING btree ("tenant_id","email");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;