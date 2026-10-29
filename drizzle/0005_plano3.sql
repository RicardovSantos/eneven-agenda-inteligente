-- Plano 3: seed dos planos, plano dos estabelecimentos existentes e RLS de
-- `invitations`. Escrita à mão (drizzle-kit generate --custom): o drizzle-kit
-- não expressa dados, ALTER ... SET NOT NULL após backfill, grants nem RLS.

-- Planos iniciais (valores em centavos; limite nulo = ilimitado).
INSERT INTO "plans" ("code", "name", "price_cents", "max_professionals", "monthly_messages", "sort_order")
VALUES
  ('essencial', 'Essencial', 3990, 2, 300, 1),
  ('profissional', 'Profissional', 6990, 6, 800, 2),
  ('studio', 'Studio', 10990, NULL, 1500, 3)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint

-- Estabelecimentos já existentes entram no Essencial; só depois a coluna vira NOT NULL.
UPDATE "tenants"
SET "plan_id" = (SELECT "id" FROM "plans" WHERE "code" = 'essencial')
WHERE "plan_id" IS NULL;
--> statement-breakpoint

ALTER TABLE "tenants" ALTER COLUMN "plan_id" SET NOT NULL;
--> statement-breakpoint

-- `plans` é catálogo global: o ALTER DEFAULT PRIVILEGES de 0003 concederia acesso
-- a `agenda_app` em toda tabela nova, então o acesso é revogado explicitamente.
REVOKE ALL ON "plans" FROM agenda_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON "invitations" TO agenda_app;
--> statement-breakpoint

-- RLS de `invitations`, igual às demais tabelas de tenant (veja 0003_rls.sql).
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "invitations"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
