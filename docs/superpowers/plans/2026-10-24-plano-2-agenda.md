# Plano 2 — Núcleo da agenda

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um estabelecimento configura serviços, equipe, horários e regras; recebe agendamentos pela página pública `agenda.eneven.com.br/{slug}` sem dupla reserva; e gerencia a agenda no painel (mês + lista do dia, detalhe com ações, novo agendamento, bloqueios), no computador e no celular.

**Architecture:** Novas tabelas multiempresa com `tenant_id`, protegidas por Row Level Security: todo acesso a dados do estabelecimento passa por `withTenant(db, tenantId, fn)`, que abre uma transação, fixa `app.tenant_id` e troca para o papel sem privilégios `agenda_app`. A dupla reserva é impedida no banco por constraint de exclusão (`btree_gist`). A disponibilidade é uma função pura testável. Telas seguem os mockups aprovados.

**Tech Stack:** o do Plano 1 + `date-fns` v4 e `@date-fns/tz` (fuso), `next/og` (imagem de compartilhamento por salão), Playwright (teste ponta a ponta), serviço Postgres 17 no CI.

**Spec:** `docs/superpowers/specs/2026-10-24-eneven-agenda-inteligente-design.md` (§7.1, §7.2 exceto clientes/dashboard, §7.4, §7.5 imagem por salão, §6 assistente). **Design:** `docs/design/sistema-visual.md`, `docs/design/telas/plano-2.md` e os mockups aprovados `docs/design/plano-2/*.dc.html` (fonte de verdade visual).

## Global Constraints

- Tudo do Plano 1 continua valendo (pt-BR, identificadores em inglês, rotas em português, `getDb()`, `createTestDb()`, cookies, rate limit, trailer de commit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
- **Nenhuma consulta a tabela com `tenant_id` fora de `withTenant`.** O `tenantId` vem sempre da sessão (painel) ou do slug resolvido no servidor (página pública) — nunca do corpo da requisição.
- Fuso: horários calculados no fuso do estabelecimento (`tenants.timezone`, padrão `America/Sao_Paulo`); gravados como `timestamptz`.
- Dinheiro em centavos (`integer`); exibição `R$ 1.234,50`.
- Status do agendamento (banco → tela): `scheduled` Agendado, `confirmed` Confirmado, `completed` Atendido, `no_show` Faltou, `canceled` Cancelado.
- Regras padrão (§7.4): intervalo entre horários 15 min, antecedência mínima 60 min, até 60 dias à frente, cancelar/remarcar pelo cliente até 120 min antes.
- Mensagem de conflito: **"Esse horário acabou de ser reservado. Escolha outro."**
- Rotas reservadas já existentes continuam valendo; `agendamento` já está em `RESERVED_SLUGS`.
- Telas: reproduzir os mockups aprovados; cores do status e da paleta de profissionais do sistema visual.
- Os lembretes por WhatsApp são do Plano 4: aqui, remarcar/cancelar no painel oferece o botão "Avisar pelo WhatsApp" (abre `https://wa.me/{telefone}?text=…` com a mensagem pronta), sem envio automático.

## Review Focus

1. **Dois clientes reservando o mesmo horário ao mesmo tempo** → um conclui, o outro recebe a mensagem de conflito; nunca dois agendamentos sobrepostos (teste concorrente no Postgres real do CI — Task 3).
2. **Estabelecimento A tentando ler/alterar dado do B** (id de agendamento de outro tenant em ação do painel ou na URL) → nada é retornado/alterado (teste RLS com papel `agenda_app` — Task 1; teste de ação com id alheio — Task 8).
3. **Horário que atravessa o almoço ou o fechamento** (serviço de 40 min às 11:40 com intervalo 12:00–13:00) → não é oferecido (Task 2).
4. **Agendar no limite**: antecedência mínima e "até N dias", e o próprio dia de hoje com horários já passados → nunca oferecer horário no passado ou fora da janela (Task 2).
5. **Cliente que já existe (mesmo WhatsApp com outra máscara)** → o agendamento vai para o mesmo cadastro; nome não é sobrescrito por um vazio (Task 3).

---

### Task 1: Esquema da agenda, RLS e `withTenant`

**Files:**
- Modify: `src/db/schema.ts` (novas tabelas e colunas), `src/db/client.ts` e `tests/helpers/test-db.ts` (extensão `btree_gist` no PGlite), `.github/workflows/ci.yml` (job com Postgres)
- Create: `drizzle/0002_*.sql` gerada + `drizzle/0003_rls.sql` custom (`pnpm drizzle-kit generate --custom --name rls`), `src/server/tenant-db.ts`
- Test: `tests/db/agenda-schema.test.ts`, `tests/db/rls.test.ts`, `tests/pg/` (testes que só rodam com `TEST_DATABASE_URL`)

**Interfaces:**
- Colunas novas em `tenants`: `address text`, `instagram text`, `about text`, `slotIntervalMin integer not null default 15`, `minNoticeMin integer not null default 60`, `maxDaysAhead integer not null default 60`, `cancelWindowMin integer not null default 120`, `onboardingCompletedAt timestamptz`.
- `tenantLogos`: `tenantId uuid pk fk cascade`, `mime text`, `data bytea`, `updatedAt`.
- `businessHours`: `id uuid pk`, `tenantId`, `weekday smallint (0=domingo..6)`, `startsAt time`, `endsAt time` (vários intervalos por dia).
- `professionals`: `id`, `tenantId`, `name`, `color text`, `active boolean default true`, `sortOrder integer default 0`, `userId uuid null fk users set null`, `createdAt`.
- `professionalHours`: `id`, `tenantId`, `professionalId fk cascade`, `weekday`, `startsAt time`, `endsAt time`.
- `services`: `id`, `tenantId`, `name`, `description text`, `durationMin integer`, `bufferAfterMin integer default 0`, `priceCents integer`, `visible boolean default true`, `sortOrder`, `archivedAt timestamptz`, `createdAt`.
- `professionalServices`: `tenantId`, `professionalId fk cascade`, `serviceId fk cascade`, pk (`professionalId`,`serviceId`).
- `timeBlocks`: `id`, `tenantId`, `professionalId null fk cascade` (nulo = estabelecimento todo), `startsAt`, `endsAt`, `reason text`, `createdAt`.
- `customers`: `id`, `tenantId`, `name`, `phone text` (normalizado `55…`), `email text null`, `notes text`, `createdAt`; unique (`tenantId`, `phone`).
- enum `booking_status` (`scheduled|confirmed|completed|no_show|canceled`), enum `booking_source` (`public|panel`), enum `canceled_by` (`customer|staff`).
- `bookings`: `id`, `tenantId`, `professionalId fk restrict`, `customerId fk restrict`, `startsAt`, `endsAt` (fim do atendimento), `blockedUntil` (fim + buffer), `status default 'scheduled'`, `source`, `totalCents`, `manageTokenHash text unique`, `notes`, `canceledAt`, `canceledBy`, `createdByUserId null`, `createdAt`, `updatedAt`; índices (`tenantId`,`startsAt`), (`professionalId`,`startsAt`); **`EXCLUDE USING gist (professional_id WITH =, tstzrange(starts_at, blocked_until, '[)') WITH &&) WHERE (status <> 'canceled')`** (nome `bookings_no_overlap`).
- `bookingServices`: `id`, `tenantId`, `bookingId fk cascade`, `serviceId fk set null`, `name` (cópia), `durationMin`, `priceCents`, `position`.
- Migração `0003_rls.sql`: `CREATE EXTENSION IF NOT EXISTS btree_gist` (antes da exclusão — ordene as migrações para isso), `CREATE ROLE agenda_app NOLOGIN` (idempotente via `DO $$ … $$`), `GRANT USAGE ON SCHEMA public`, `GRANT SELECT, INSERT, UPDATE, DELETE` nas tabelas de tenant e `SELECT` em `tenants`; para cada tabela com `tenant_id`: `ENABLE` + `FORCE ROW LEVEL SECURITY` e política `tenant_isolation` `USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (mesma)`.
- `withTenant<T>(db: Db, tenantId: string, fn: (tx: Db) => Promise<T>): Promise<T>` em `src/server/tenant-db.ts` — `db.transaction`: `select set_config('app.tenant_id', $1, true)`, `set local role agenda_app`, depois `fn(tx)`.
- `isExclusionViolation(error: unknown): boolean` (SQLSTATE `23P01`, seguindo `cause`) em `src/server/db-errors.ts`.
- [ ] **Step 1: Testes que falham:** inserir dois agendamentos sobrepostos do mesmo profissional → segundo lança `23P01`; sobrepostos de profissionais diferentes → ok; sobreposto com o primeiro `canceled` → ok; encostados (`10:00–10:30` e `10:30–11:00`) → ok. RLS: dentro de `withTenant(db, A, …)` um `select` em `bookings` não vê linhas do tenant B; `insert` com `tenantId` de B lança erro; fora de `withTenant` como `agenda_app` (`set role`) → 0 linhas.
- [ ] **Step 2:** `pnpm test tests/db` → FAIL.
- [ ] **Step 3:** Implementar schema, gerar `0002`, escrever `0003_rls.sql` (ajustar `drizzle/meta/_journal.json` pelo próprio `drizzle-kit generate --custom`), PGlite com `extensions: { btree_gist }` de `@electric-sql/pglite/contrib/btree_gist` (cliente de dev e helper de teste), `withTenant`, `isExclusionViolation`. Se o PGlite não suportar `CREATE ROLE`/`SET ROLE`, os testes de RLS vão para `tests/pg/` (só com Postgres real) e o CI os roda — registrar no relatório.
- [ ] **Step 4:** CI: novo job `test-pg` com `services: postgres:17` (`POSTGRES_USER=agenda`, superusuário como em produção), `TEST_DATABASE_URL`, roda `pnpm test:pg` (Vitest com `tests/pg/**`, aplica migrações num banco limpo). Script `test:pg` no package.json.
- [ ] **Step 5:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` verdes; commit `feat: esquema da agenda com RLS e trava de dupla reserva`.

### Task 2: Motor de disponibilidade

**Files:** Create `src/server/agenda/availability.ts`, `src/server/agenda/time.ts`; Test `tests/agenda/availability.test.ts`

**Interfaces:**
- `type TimeRange = { start: string; end: string }` (`"HH:mm"`), `type WeeklyHours = Record<0|1|2|3|4|5|6, TimeRange[]>`.
- `type AvailabilityInput = { date: string /* "yyyy-MM-dd" no fuso do tenant */; timezone: string; now: Date; rules: { slotIntervalMin: number; minNoticeMin: number; maxDaysAhead: number }; businessHours: WeeklyHours; professionals: Array<{ id: string; hours: WeeklyHours }>; blocks: Array<{ professionalId: string | null; startsAt: Date; endsAt: Date }>; busy: Array<{ professionalId: string; startsAt: Date; blockedUntil: Date }>; durationMin: number; bufferAfterMin: number }`.
- `type Slot = { startsAt: Date; endsAt: Date; blockedUntil: Date; professionalIds: string[] }`.
- `getAvailableSlots(input: AvailabilityInput): Slot[]` — para cada início no passo `slotIntervalMin` a partir do começo de cada intervalo de trabalho: o atendimento inteiro (`start` até `start + duração + buffer`) cabe dentro de um intervalo do estabelecimento **e** de um intervalo do profissional; não colide com bloqueio (do profissional ou geral) nem com `busy` daquele profissional; `start >= now + minNoticeMin`; data ≤ hoje + `maxDaysAhead`. `professionalIds` = quem pode naquele início (ordem de entrada).
- `pickProfessional(slot: Slot, loadByProfessional: Record<string, number>): string` — "qualquer disponível": o de menor carga no dia; empate → primeiro.
- `getAvailableDates(input sem date, from: string, days: number): string[]` — dias com ao menos um horário (para a faixa de dias).
- [ ] **Step 1: Testes que falham** (fuso `America/Sao_Paulo`, `now = 2026-10-27T12:00:00-03:00`, estabelecimento seg–sáb 09:00–12:00 e 13:00–19:00, domingo fechado, intervalo 15 min, antecedência 60, 60 dias):
  - Serviço 30 min em `2026-10-28`: primeiro horário `09:00`, último `18:30`; nenhum entre `11:31` e `12:59` que atravesse o almoço (`11:30` existe, `11:45` não).
  - Serviço 40 min + buffer 10: `11:15` não existe (11:15–12:05), `11:00` existe.
  - Hoje `2026-10-27`: nenhum horário antes de `13:00` (now 12:00 + 60 min → 13:00); `13:00` existe.
  - Domingo `2026-11-01` → `[]`; `2026-12-27` (61 dias) → `[]`.
  - Profissional com ocupado `14:00–14:40` (blockedUntil): `13:30` (30 min) existe, `13:45` não, `14:30` não, `14:45` existe.
  - Bloqueio geral `2026-10-28 15:00–16:00` remove `15:00` para todos; bloqueio só do profissional A mantém `15:00` com `professionalIds = [B]`.
  - Dois profissionais com expedientes diferentes: `professionalIds` correto em cada horário.
  - `pickProfessional` escolhe o de menor carga.
- [ ] **Step 2–4:** RED → implementar com `@date-fns/tz` (`TZDate`) → GREEN.
- [ ] **Step 5:** commit `feat: motor de disponibilidade`.

### Task 3: Serviço de agendamentos

**Files:** Create `src/server/agenda/bookings.ts`, `src/server/agenda/customers.ts`, `src/server/agenda/load.ts`; Test `tests/agenda/bookings.test.ts`, `tests/pg/bookings-concurrency.test.ts`

**Interfaces:**
- `loadAvailabilityContext(tx: Db, tenantId: string, opts: { date: string; serviceIds: string[]; professionalId?: string }): Promise<AvailabilityInput>` — monta a entrada da Task 2 a partir do banco (soma duração dos serviços; buffer = maior `bufferAfterMin` entre eles; só profissionais ativos que fazem **todos** os serviços).
- `upsertCustomer(tx, tenantId, input: { name: string; phone: string; email?: string | null }): Promise<{ id: string }>` — telefone normalizado com `normalizeBrazilPhone`; existente: atualiza nome só se o novo não for vazio; e-mail só se vier.
- `createBooking(db: Db, tenantId: string, input: { serviceIds: string[]; professionalId: string | "any"; startsAt: Date; customer: { name; phone; email? }; source: "public" | "panel"; notes?: string; createdByUserId?: string; allowOutsideHours?: boolean }, now?: Date): Promise<{ bookingId: string; manageToken: string }>` — dentro de `withTenant`: recalcula disponibilidade (exceto `allowOutsideHours`, que só ignora expediente/antecedência mas mantém a trava), resolve "any" com `pickProfessional`, grava `bookings` + `bookingServices` (cópia de nome/duração/preço), token de gestão aleatório (32 bytes, grava o SHA-256). Violação `23P01` ou horário indisponível → `BookingError("slot_taken")` com a mensagem de conflito.
- `rescheduleBooking(db, tenantId, bookingId, newStartsAt, actor: "staff" | "customer", now?)`, `cancelBooking(db, tenantId, bookingId, actor, now?)`, `setBookingStatus(db, tenantId, bookingId, status: "confirmed" | "completed" | "no_show" | "scheduled")`.
- Transições permitidas: `scheduled→confirmed|completed|no_show|canceled`, `confirmed→scheduled|completed|no_show|canceled`, `completed→scheduled` (desfazer), `no_show→scheduled` (desfazer); `canceled` é final. Cliente (`actor: "customer"`) só cancela/remarca até `cancelWindowMin` antes do início → senão `BookingError("outside_window")`.
- `findBookingByManageToken(db, token): Promise<{ tenantId; bookingId } | null>` (consulta fora do RLS por hash → depois tudo via `withTenant`).
- [ ] **Step 1: Testes que falham:** cria agendamento público; conflito no mesmo horário → `slot_taken`; "any" escolhe o profissional livre; cliente com `"+55 (11) 98765-4321"` e depois `"11987654321"` → mesmo `customerId`; nome vazio não sobrescreve; cancelar libera o horário (novo agendamento no mesmo horário ok); cliente cancelando 60 min antes com janela 120 → `outside_window`; transição inválida (`canceled→confirmed`) → erro; remarcar para horário ocupado → `slot_taken`; serviço de outro tenant no `serviceIds` → erro (RLS não enxerga).
- [ ] **Step 2:** `tests/pg/bookings-concurrency.test.ts`: 10 `createBooking` simultâneos no mesmo horário/profissional (conexões separadas do `postgres-js`) → exatamente 1 sucesso, 9 `slot_taken`.
- [ ] **Step 3–4:** implementar → verde (`pnpm test`, e `pnpm test:pg` se houver Postgres; senão confiar no CI e registrar).
- [ ] **Step 5:** commit `feat: serviço de agendamentos`.

### Task 4: Configurações do estabelecimento

**Files:** Create `src/app/painel/configuracoes/page.tsx` + componentes em `src/components/settings/`, `src/server/settings/*.ts`, `src/app/api/logo/[slug]/route.ts`, `src/lib/color.ts`; Test `tests/settings/*.test.ts`, `tests/lib/color.test.ts`

**Interfaces:**
- `ensureReadableBrandColor(hex: string): { color: string; adjusted: boolean }` — escurece (HSL, passo de 4% de luminosidade) até contraste ≥ 4.5 com `#FFFFFF`; hex inválido → erro.
- `updateBusinessInfo`, `updateBranding` (cor), `uploadLogo(tenantId, file: { mime; bytes })` (aceita png/jpeg/webp ≤ 1 MB; `sharp` → PNG quadrado 256px, `fit: "cover"`), `removeLogo`, `updateBusinessHours(tenantId, hours: WeeklyHours)` (valida intervalos sem sobreposição e `start < end`), `updateBookingRules` (valores só das listas da tela), `updateSlug(tenantId, slug)` (mesmas regras de `slugify`/reservados; ocupado → erro "Esse link já está em uso.").
- `GET /api/logo/{slug}` → PNG com `Cache-Control: public, max-age=300`; sem logo → 404.
- Tela conforme `docs/design/telas/plano-2.md` § Configurações. Ações do servidor com `requireTenantSession` e papel `owner` (recepção/profissional → 403).
- [ ] Steps: testes (contraste: `#F581FB` → ajustada e contraste ≥ 4.5; `#3E07D2` → não ajustada; horários sobrepostos → erro; slug reservado → erro; upload de 2 MB → erro; papel `staff` → negado) → RED → implementar → GREEN → screenshots 390/1280 claro/escuro → commit `feat: configurações do estabelecimento`.

### Task 5: Serviços e equipe

**Files:** Create `src/app/painel/servicos/page.tsx`, `src/app/painel/equipe/page.tsx`, componentes em `src/components/catalog/`, `src/server/catalog/services.ts`, `src/server/catalog/professionals.ts`; Test `tests/catalog/*.test.ts`

**Interfaces:**
- `listServices`, `saveService(tenantId, input: { id?; name; description?; durationMin (5–480, múltiplo de 5); bufferAfterMin (0–60); priceCents (≥0); visible; professionalIds: string[] })`, `archiveService` (some da página e do painel; agendamentos antigos mantêm a cópia).
- `listProfessionals`, `saveProfessional(tenantId, input: { id?; name; color (da paleta); active; serviceIds; hours: WeeklyHours })` — expediente fora do horário de funcionamento → erro "O horário do profissional precisa estar dentro do horário de funcionamento."; `deactivateProfessional` (com agendamentos futuros → aviso com a contagem e confirmação).
- Telas: Serviços = mockup `Servicos.dc.html`; Equipe = `plano-2.md` § Equipe. Papel `owner` edita; `reception` só vê.
- [ ] Steps: testes (validações acima; serviço sem profissional não aparece na página pública — testado via `loadAvailabilityContext`) → implementar → screenshots → commit `feat: serviços e equipe`.

### Task 6: Primeiros passos (assistente)

**Files:** Create `src/app/painel/comecar/page.tsx`, componentes `src/components/onboarding/`, `src/server/onboarding.ts`; Modify `src/app/painel/layout.tsx` (redireciona para `/painel/comecar` se `onboardingCompletedAt` nulo e não estiver nessa rota); Test `tests/onboarding.test.ts`

**Interfaces:**
- `getOnboardingState(tenantId): Promise<{ step: 1|2|3|4|"done"; hasLogo; hasHours; servicesCount; professionalsCount }>`; `completeOnboarding(tenantId)`; `skipOnboarding(tenantId)`.
- Ao criar o estabelecimento (cadastro por senha e Google), já gravar: horário padrão seg–sex 09:00–18:00 e sáb 09:00–13:00; o dono como primeiro profissional (nome do usuário, cor `#3E07D2`, mesmo horário). Reutiliza as funções das Tasks 4–5.
- Tela conforme `plano-2.md` § Primeiros passos, com o fio de progresso e o final com link, "Copiar link", "Abrir minha página" e o texto para o WhatsApp.
- [ ] Steps: testes (estado por etapa; cadastro novo já tem horário e profissional; painel redireciona até concluir/pular) → implementar → screenshots → commit `feat: primeiros passos`.

### Task 7: Página pública de agendamento e gerenciar agendamento

**Files:** Create `src/app/[slug]/page.tsx` (+ `opengraph-image.tsx`), `src/app/[slug]/actions.ts`, componentes `src/components/booking/`, `src/app/agendamento/[token]/page.tsx`, `src/app/api/agendamento/[token]/ics/route.ts`, `src/server/public/*.ts`, `src/lib/ics.ts`; Modify `src/server/security/limits.ts`; Test `tests/public/*.test.ts`, `tests/lib/ics.test.ts`

**Interfaces:**
- `getPublicTenant(slug): Promise<{ tenant; canBook: boolean; reason?: "email_unverified" | "inactive" | "no_services" } | null>` — `canBook` exige e-mail do dono confirmado, status `trial` (dentro do prazo) ou `active`, e ao menos um serviço visível com profissional ativo.
- Server actions públicas: `getSlotsAction(slug, { serviceIds, professionalId, date })`, `getDatesAction(slug, { serviceIds, professionalId, from })`, `bookAction(slug, input)` (zod; rate limit 10 / 10 min por IP e 5 / h por telefone; consentimento obrigatório) → redireciona para a confirmação `/{slug}?ok={token-curto}` ou mostra `slot_taken`.
- Fluxo em uma rota com estado no cliente (passos 1–4 + confirmação) conforme mockups e `plano-2.md`; cor da marca via `ensureReadableBrandColor`; logo de `/api/logo/{slug}` ou iniciais.
- `opengraph-image.tsx`: 1200×630 com nome, logo (ou iniciais) e cor do salão + fio do tempo Eneven; `generateMetadata` com título "Agende no {nome}".
- `buildIcs(event: { uid; title; startsAt; endsAt; location?; description? }): string` (RFC 5545, CRLF, UTC).
- `/agendamento/{token}`: ver, "Adicionar ao calendário" (`.ics`), remarcar (seletor do passo 3), cancelar — com as regras da janela (`actor: "customer"`).
- [ ] Steps: testes (`getPublicTenant` por motivo; `bookAction` sem consentimento → erro; rate limit; ICS válido com `DTSTART:20261028T173000Z`; token inválido → 404; cancelamento fora da janela → mensagem) → implementar → Playwright e2e em `tests/e2e/booking.spec.ts` (cadastro do estabelecimento via helper de banco, agendar pelo fluxo inteiro, ver na agenda) rodando em `pnpm test:e2e` contra `pnpm dev` com PGlite → screenshots 390 claro/escuro de cada passo → commit `feat: página pública de agendamento`.

### Task 8: Agenda do painel

**Files:** Modify `src/app/painel/page.tsx`; Create componentes `src/components/agenda/` (MonthView, DayList, WeekStrip, BookingDetail, NewBookingDialog, BlockDialog, NowLine), `src/app/painel/actions.ts`, `src/server/agenda/panel-queries.ts`; Test `tests/agenda/panel.test.ts`

**Interfaces:**
- `getMonthOverview(tenantId, month: "yyyy-MM", professionalId?)` → por dia: `count`, `occupancy` (minutos agendados ÷ minutos de expediente, 0–1), `closed`.
- `getDayAgenda(tenantId, date, professionalId?)` → agendamentos (com cliente, serviços, profissional, status) e bloqueios do dia, ordenados; `totalCents` previsto (não cancelados).
- Server actions (todas com `requireTenantSession`; `staff` só vê/age nos próprios agendamentos): `confirmBookingAction`, `completeBookingAction`, `noShowBookingAction`, `undoStatusAction`, `cancelBookingAction`, `rescheduleBookingAction`, `createBookingAction` (painel, `allowOutsideHours` opcional), `searchCustomersAction(query)` (nome ou telefone, 8 resultados), `createBlockAction`, `deleteBlockAction`.
- `buildWhatsAppLink(phone, text): string` e textos prontos: remarcado "Olá, {nome}! Seu horário de {serviço} no {estabelecimento} foi remarcado para {dia} às {hora}." / cancelado "Olá, {nome}! Seu horário de {serviço} no {estabelecimento} em {dia} às {hora} foi cancelado." / lembrete "Olá, {nome}! Lembrando do seu horário de {serviço} no {estabelecimento} {dia} às {hora}. Para confirmar ou remarcar: {link de gestão}".
- Telas: `Main.dc.html` (≥1024px: mês com barra de ocupação + coluna do dia + filtro por profissional + abas Mês/Dia — **Semana fica para depois**), `AgendaCelular.dc.html` (<1024px), `Detalhe.dc.html` (folha no celular; painel lateral à direita no computador), linha do "agora" atualizada a cada minuto, novo agendamento e bloqueios conforme `plano-2.md`. A aba "Dia" mostra colunas por profissional (horários na vertical, blocos proporcionais à duração).
- [ ] Steps: testes (ocupação calculada; dia ordenado com bloqueios; ação com id de agendamento de outro tenant → "não encontrado"; `staff` não altera agendamento de outro profissional; textos do WhatsApp com dados certos) → implementar → screenshots 390/1280 claro/escuro (agenda vazia e cheia, detalhe, novo agendamento, bloqueio) → commit `feat: agenda do painel`.

### Task 9: Acabamento e verificação ponta a ponta

**Files:** variados.

- [ ] Itens do menu habilitados (Agenda, Serviços, Equipe, Configurações), bloco "Seu link" no menu, estados vazios e toasts conforme `plano-2.md` § Regras gerais.
- [ ] Playwright e2e completo: cadastro → primeiros passos → página pública → agendar → agenda mostra → confirmar → remarcar → cancelar.
- [ ] `pnpm test && pnpm test:e2e && pnpm typecheck && pnpm lint && pnpm build` verdes; CI verde (inclui `test-pg`).
- [ ] Commit `chore: acabamento do Plano 2`.
