-- Trava de dupla reserva, papel restrito da aplicação e Row Level Security.
-- Escrita à mão (drizzle-kit generate --custom): o drizzle-kit não expressa
-- constraints de exclusão, papéis, grants nem políticas de RLS.

-- btree_gist permite combinar "=" (profissional) e "&&" (intervalo) no mesmo índice GiST.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- Um profissional não pode ter dois agendamentos não cancelados com
-- [starts_at, blocked_until) sobrepostos. Intervalos encostados (fim = início) são permitidos.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "professional_id" WITH =,
    tstzrange("starts_at", "blocked_until", '[)') WITH &&
  ) WHERE ("status" <> 'canceled');
--> statement-breakpoint

-- Papel sem login usado por `withTenant` (SET LOCAL ROLE agenda_app). O usuário da
-- conexão (superusuário em produção, que ignora RLS mesmo com FORCE) só vira
-- agenda_app dentro da transação, onde as políticas valem.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenda_app') THEN
    CREATE ROLE agenda_app NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint

-- Garante que quem roda as migrações (e a aplicação) possa assumir o papel,
-- mesmo quando não é superusuário.
DO $$
BEGIN
  IF NOT pg_has_role(current_user, 'agenda_app', 'MEMBER') THEN
    EXECUTE format('GRANT agenda_app TO %I', current_user);
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO agenda_app;
--> statement-breakpoint

-- O papel só enxerga `tenants` (sem escrita) e as tabelas de tenant. Não recebe
-- nada em users, sessions, email_tokens, oauth_accounts, audit_log e memberships.
GRANT SELECT ON "tenants" TO agenda_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "tenant_logos", "business_hours", "professionals", "professional_hours",
  "services", "professional_services", "time_blocks", "customers",
  "bookings", "booking_services"
TO agenda_app;
--> statement-breakpoint

-- Tabelas criadas por migrações futuras também ficam acessíveis ao papel; cada
-- tabela de tenant nova ainda precisa habilitar RLS explicitamente (veja abaixo).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO agenda_app;
--> statement-breakpoint

-- RLS em toda tabela de tenant: só enxerga e grava linhas do tenant definido em
-- `app.tenant_id`. Sem o parâmetro (ou vazio), nenhuma linha passa.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenant_logos', 'business_hours', 'professionals', 'professional_hours',
    'services', 'professional_services', 'time_blocks', 'customers',
    'bookings', 'booking_services'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END
$$;
