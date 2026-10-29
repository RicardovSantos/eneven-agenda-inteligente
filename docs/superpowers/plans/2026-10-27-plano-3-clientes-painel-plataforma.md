# Plano 3 — Clientes, visão geral, acessos da equipe e plataforma

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O estabelecimento passa a ter a ficha dos clientes, a visão geral do mês com faturamento e faltas, e logins para a recepção e os profissionais. O Ricardo ganha o painel da plataforma: estabelecimentos, planos, teste, bloqueio, "entrar como" com auditoria e cadastro pelo painel dele.

**Architecture:** Tudo que é dado do estabelecimento continua passando por `withTenant` (RLS). As consultas novas ficam em módulos puros de servidor (`src/server/clients`, `src/server/dashboard`, `src/server/team`, `src/server/platform`), que recebem `db` e um ator vindo da sessão, e as páginas e ações só fazem a ponte. As tabelas da plataforma (`plans`) e as consultas entre estabelecimentos do super-admin usam a conexão do dono, fora do RLS, sempre atrás de `requireSuperAdminSession()`. O "entrar como" troca o estabelecimento da própria sessão e marca `sessions.support_started_at`.

**Tech Stack:** o do Plano 2. Sem bibliotecas novas: os gráficos são barras em HTML/CSS, como no mockup.

**Spec:** `docs/superpowers/specs/2026-10-24-eneven-agenda-inteligente-design.md` (§5 papéis, §6 cadastro pelo painel do Ricardo, §7.2 Clientes, Dashboard e "usuários e papéis", §7.3 painel do super-admin, §9 planos configuráveis). **Design:** `docs/design/sistema-visual.md`, `docs/design/telas/plano-3.md` e os mockups aprovados `docs/design/plano-3/*.dc.html` (fonte de verdade visual).

## Global Constraints

- Tudo dos Planos 1 e 2 continua valendo (pt-BR na interface, identificadores em inglês, rotas em português, `getDb()`, `createTestDb()`, `withTenant`, dinheiro em centavos, fuso do estabelecimento, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
- Antes de escrever código Next, ler o guia relevante em `node_modules/next/dist/docs/` (AGENTS.md).
- **Nenhuma consulta a tabela com `tenant_id` fora de `withTenant`**, exceto: busca do convite pelo hash do token (como `findBookingByManageToken`) e as consultas agregadas do super-admin em `src/server/platform/*`, que só rodam depois de `requireSuperAdminSession()`.
- `tenantId` e papel vêm sempre da sessão; o super-admin passa o `tenantId` alvo pela URL do `/admin`, e o servidor revalida que a sessão é de super-admin.
- Papéis (§5): proprietário faz tudo; recepção agenda e clientes de todos, sem visão geral (faturamento), sem configurações; profissional só a própria agenda e os clientes que atendeu, sem faturamento. A regra já existe na agenda (`PanelActor`, `scopedProfessionalId` em `src/server/agenda/panel-ops.ts`) e é reaproveitada.
- Faturamento **realizado** = soma de `bookings.total_cents` com status `completed`. **Previsto** = `scheduled` + `confirmed` com início no futuro. Faltas = `no_show / (completed + no_show)`. Cancelamentos = `canceled / todos do mês`.
- Planos iniciais (§9): Essencial R$ 39,90, até 2 profissionais, 300 mensagens; Profissional R$ 69,90, até 6, 800; Studio R$ 109,90, ilimitados, 1.500. Editáveis no `/admin/planos`. O limite de profissionais **não** é cobrado neste plano (fica para o Plano 5, com a assinatura).
- Toda ação do super-admin sobre um estabelecimento grava `audit_log` (`actor_user_id`, `tenant_id`, `action`, `details`).
- Rotas novas: `/painel/clientes`, `/painel/clientes/[id]`, `/painel/visao-geral`, `/convite/[token]`, `/admin`, `/admin/estabelecimentos/novo`, `/admin/estabelecimentos/[id]`, `/admin/planos`. `convite` entra em `RESERVED_SLUGS`.
- Copy exata vem de `docs/design/telas/plano-3.md` e dos mockups.

## Review Focus

1. **Recepção ou profissional abrindo URL de proprietário** (`/painel/visao-geral`, `/painel/configuracoes`, ação de convite chamada direto) → redireciona para `/painel` ou recebe "forbidden"; nunca vê faturamento (Tasks 5 e 6).
2. **Profissional abrindo a ficha de um cliente que não atendeu** (id na URL) → "Cliente não encontrado"; idem para id de outro estabelecimento (Task 2).
3. **Mês que atravessa a meia-noite no fuso** (agendamento às 23:30 de 31/10 em São Paulo, que em UTC já é 01/11) → conta em outubro na visão geral e no gráfico (Task 4).
4. **Convite aceito duas vezes, vencido, ou para e-mail que já é de outro estabelecimento** → o segundo aceite e o vencido mostram "Este convite não vale mais"; convidar e-mail de outro estabelecimento recusa com mensagem clara (Task 6).
5. **Super-admin "entrou como" e depois clicou em Sair, ou a sessão de suporte num salão que foi cancelado** → Sair encerra a sessão inteira; voltar à plataforma devolve o próprio estabelecimento dele; nada fica preso no salão alheio (Task 8).

---

### Task 1: Esquema do Plano 3

**Files:**
- Modify: `src/db/schema.ts`, `src/server/auth/session.ts` (`createSession` grava `last_login_at`), `src/server/auth/signup.ts` (`createTenantWithOwner` usa o plano Essencial), `src/server/tenants/slug.ts` (`convite` reservado)
- Create: `drizzle/0004_*.sql` gerada + `drizzle/0005_plano3.sql` custom (seed dos planos, `planId` dos estabelecimentos existentes, RLS de `invitations`)
- Test: `tests/db/plano3-schema.test.ts`, `tests/pg/plano3.test.ts`

**Interfaces:**
- `plans`: `id uuid pk`, `code text unique` (`essencial|profissional|studio`), `name text`, `priceCents integer`, `maxProfessionals integer null` (nulo = ilimitado), `monthlyMessages integer`, `active boolean default true`, `sortOrder integer`, `createdAt`. Sem `tenant_id`, sem RLS, sem grant para `agenda_app`.
- `tenants`: `planId uuid not null fk plans restrict` (migração: adiciona nulo, preenche com Essencial, depois `set not null`), `activatedAt timestamptz null` (primeira vez que virou `active`).
- `users.lastLoginAt timestamptz null`; `sessions.supportStartedAt timestamptz null`.
- enum `invitation_role` (`owner|reception|staff`); `invitations`: `id`, `tenantId`, `email text` (minúsculas, check), `name text`, `role`, `professionalId uuid null` (FK composta `(tenant_id, professional_id)` → `professionals`, `on delete set null (professional_id)`), `tokenHash text unique`, `invitedByUserId uuid null fk users set null`, `expiresAt`, `acceptedAt null`, `revokedAt null`, `sentAt`, `createdAt`; índice (`tenantId`, `email`). RLS `tenant_isolation` + grants para `agenda_app` iguais às outras tabelas de tenant.
- Constantes em `src/server/platform/plans.ts`: `DEFAULT_PLAN_CODE = "essencial"`; `getDefaultPlanId(db): Promise<string>`.
- [ ] **Step 1: Testes que falham:** `plans` tem as 3 linhas com os valores dos Global Constraints; tenant criado por `createTenantWithOwner` tem `planId` do Essencial; `createSession` preenche `users.last_login_at`; `isReservedSlug("convite")` (ou checagem equivalente usada no cadastro) é verdadeiro; em `tests/pg`: dentro de `withTenant(A)` não se lê convite de B e `insert` com `tenantId` de B falha; migração em banco com tenant já existente deixa `plan_id` preenchido.
- [ ] **Step 2:** `pnpm test tests/db` e `pnpm test:pg` → FAIL.
- [ ] **Step 3:** Schema, `pnpm db:generate`, `drizzle-kit generate --custom --name plano3` para seed/RLS, ajustes em `createSession`, `createTenantWithOwner`, `RESERVED_SLUGS`. Antes do deploy, conferir em produção se algum estabelecimento já usa o slug `convite` (anotar no relatório; não alterar dados).
- [ ] **Step 4:** `pnpm test && pnpm test:pg && pnpm typecheck && pnpm lint && pnpm build` verdes; commit `feat: esquema de planos, convites e suporte`.

### Task 2: Clientes (servidor)

**Files:**
- Create: `src/server/clients/queries.ts`, `src/server/clients/mutations.ts`, `src/server/clients/index.ts`
- Modify: `src/server/agenda/errors.ts` (sem mudança se reaproveitar `BookingError`; senão `ClientError` próprio no módulo)
- Test: `tests/clients/queries.test.ts`, `tests/clients/mutations.test.ts`

**Interfaces:**
- Consome `PanelActor` e `findStaffProfessional` (Plano 2), `normalizeBrazilPhone` (`src/lib/phone.ts`), `withTenant`.
- `type ClientFilter = "all" | "upcoming" | "lapsed"`; `LAPSED_DAYS = 60`; `CLIENTS_PAGE_SIZE = 50`.
- `type ClientListItem = { id; name; phone; visits: number; totalCents: number | null /* null para staff */; noShows: number; lastVisitAt: Date | null; nextBookingAt: Date | null }`.
- `listClients(db, actor, input: { query?: string; filter: ClientFilter; page: number; now?: Date }): Promise<{ items: ClientListItem[]; total: number; hasMore: boolean }>` — ordem por nome, id; busca igual a `searchCustomers` (nome `ilike`, dígitos do telefone); `visits` = atendimentos `completed`; `lastVisitAt` = início do último `completed`; `nextBookingAt` = próximo `scheduled|confirmed` com início ≥ agora; `upcoming` = tem próximo; `lapsed` = último `completed` antes de agora − 60 dias e sem próximo. `staff`: só clientes com agendamento do próprio profissional, e os números contam só esses agendamentos.
- `type ClientProfile = ClientListItem & { email: string | null; notes: string | null; createdAt: Date; returnEveryDays: number | null; history: Array<{ bookingId; startsAt: Date; services: string[]; professionalName: string; status: BookingStatus; totalCents: number }> ; historyTotal: number }` — `returnEveryDays` = média arredondada dos intervalos em dias entre atendimentos `completed` consecutivos (nulo com menos de 2); `history` traz os 5 mais recentes primeiro, `historyTotal` a contagem.
- `getClientProfile(db, actor, clientId, opts?: { historyLimit?: number; now?: Date }): Promise<ClientProfile>` — id inválido, de outro estabelecimento ou fora do escopo do `staff` → `ClientError("not_found", "Cliente não encontrado.")`.
- `createClient(db, actor, input: { name; phone; email?; notes? }): Promise<{ id }>` e `updateClient(db, actor, id, input)` — validação zod (nome 1–80, WhatsApp válido, e-mail opcional, notas ≤ 500); telefone já usado → `ClientError("phone_taken", "Já existe um cliente com esse WhatsApp.", { existingId })`; `staff` não cria nem edita (forbidden).
- `updateClientNotes(db, actor, id, notes: string)` — permitido a todos os papéis dentro do escopo.
- [ ] **Step 1: Testes que falham** (fixtures do Plano 2 em `tests/helpers/agenda-fixtures.ts`): busca por "98123" acha o telefone; filtro `upcoming` e `lapsed` com `now` fixo (cliente com último atendimento há 61 dias e nada marcado entra em `lapsed`; com 59 dias não; com horário futuro não); `visits`/`totalCents`/`noShows` ignoram cancelados e não contam `scheduled`; `returnEveryDays` com atendimentos em 01/09, 20/09 e 06/10 → 18 (média de 19 e 16 = 17,5 → 18); paginação de 50 com `hasMore`; staff não vê cliente só atendido por outro profissional (lista e ficha) e recebe `totalCents: null`; id de outro estabelecimento → not_found; `createClient` com telefone em outra máscara de um existente → `phone_taken` com `existingId`.
- [ ] **Step 2:** `pnpm test tests/clients` → FAIL.
- [ ] **Step 3:** Implementar com agregações SQL (uma consulta por página: `left join lateral` ou `group by` em `bookings` por `customer_id`), sem N+1.
- [ ] **Step 4:** Verdes (`pnpm test && pnpm typecheck && pnpm lint`); commit `feat: consultas e cadastro de clientes`.

### Task 3: Clientes (telas)

**Files:**
- Create: `src/app/painel/clientes/page.tsx`, `src/app/painel/clientes/[id]/page.tsx`, `src/app/painel/clientes/actions.ts`, `src/components/clients/{client-list.tsx,client-profile.tsx,client-form-dialog.tsx,client-filters.tsx}`
- Modify: `src/components/panel/panel-nav.tsx` (Clientes habilitado), `src/components/agenda/new-booking-dialog.tsx` (prop `initialCustomer?: { id; name; phone }`)
- Test: `tests/clients/actions.test.ts`, `tests/app/clients-pages.test.ts` (guarda estática: as duas páginas chamam `requireOnboarded(`), `tests/e2e/clients.spec.ts`

**Interfaces:**
- Consome Task 2. Busca e filtro por `searchParams` (`?q=`, `?filtro=com-horario|sem-voltar`, `?pagina=`).
- Ações: `createClientAction(input)`, `updateClientAction(id, input)`, `updateClientNotesAction(id, notes)` → `{ ok: true; message; id? } | { ok: false; error; fieldErrors?; existingId? }` (mesmo formato de `PanelActionResult`). Rate limit de escrita igual ao das ações do painel.
- ≥1024px: lista + ficha lado a lado (`/painel/clientes/[id]`), `/painel/clientes` mostra a lista e, no lugar da ficha, "Escolha um cliente para ver a ficha."; <1024px: `/painel/clientes` só a lista, `/painel/clientes/[id]` só a ficha com "‹ Clientes".
- [ ] **Step 1: Testes que falham:** ações devolvem `fieldErrors.phone` e `existingId` no telefone repetido; `staff` recebe erro em `createClientAction`; guarda estática de `requireOnboarded(`; e2e (390px e 1280px): criar cliente → aparece na lista → abrir ficha → editar observação (toast "Observações salvas") → "Agendar" abre o novo agendamento com o cliente preenchido.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Telas seguindo `Clientes.dc.html`, `ClientesCelular.dc.html`, `ClienteCelular.dc.html` e os estados de `docs/design/telas/plano-3.md`; tema escuro com os tokens existentes.
- [ ] **Step 4:** Verdes + `pnpm build`; capturas 390px e 1440px claro/escuro anexadas ao relatório; commit `feat: tela de clientes`.

### Task 4: Visão geral (servidor)

**Files:**
- Create: `src/server/dashboard/overview.ts`, `src/server/dashboard/pending.ts`
- Test: `tests/dashboard/overview.test.ts`, `tests/dashboard/pending.test.ts`

**Interfaces:**
- `type DashboardInput = { tenantId: string; month: string /* "yyyy-MM" */; timezone: string; now: Date }`.
- `type Dashboard = { month: string; realizedCents: number; completedCount: number; averageTicketCents: number | null; previousRealizedCents: number; next30: { count: number; cents: number; until: string /* yyyy-MM-dd */ }; bookingsCount: number /* não cancelados no mês */; previousBookingsCount: number; noShow: { count: number; base: number /* completed + no_show */; rate: number | null }; canceled: { count: number; rate: number | null /* sobre todos do mês, cancelados inclusos */ }; perDay: Array<{ date: string; count: number; past: boolean }> /* todos os dias do mês */; topServices: Array<{ name: string; count: number; cents: number }> /* até 5, de booking_services dos completed, por contagem desc, empate por nome */; perProfessional: Array<{ id; name; color: string | null; completed: number; cents: number; noShows: number }> /* quem teve atendimento no mês, inclusive inativos, por cents desc */ }`.
- `getDashboard(db, input): Promise<Dashboard>` — limites do mês no fuso do estabelecimento (`@date-fns/tz`); `past` = dia local < hoje, ou hoje.
- `type PendingOutcome = { bookingId; startsAt: Date; customerName: string; services: string[]; professionalName: string }`.
- `listPendingOutcomes(db, tenantId, now): Promise<PendingOutcome[]>` — `scheduled|confirmed` com `ends_at < now`, nos últimos 90 dias, mais antigos primeiro, até 50.
- [ ] **Step 1: Testes que falham** com fuso `America/Sao_Paulo`, `now = 2026-10-27T15:00:00-03:00`: agendamento `completed` às 23:30 de 31/10 local conta em outubro e no dia `2026-10-31`; um de 00:30 de 01/10 local conta em outubro e um de 23:30 de 30/09 local não; `realizedCents` só soma `completed`; `next30` conta `scheduled|confirmed` de agora até +30 dias e não conta os de ontem; faltas 3 de 87 → `rate` ≈ 0,0345; cancelados entram em `canceled` e saem de `bookingsCount`; `topServices` soma itens de `booking_services` (atendimento com 2 serviços conta nos 2); mês sem dados → zeros, `rate: null`, `perDay` com 31 itens de `count: 0`; `listPendingOutcomes` traz o `confirmed` de anteontem e não traz `completed` nem o de daqui a 1 hora.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar em poucas consultas agregadas dentro de um `withTenant` (agrupamento por dia local com `(starts_at at time zone $tz)::date`).
- [ ] **Step 4:** Verdes; commit `feat: números da visão geral`.

### Task 5: Visão geral (telas) e menu por papel

**Files:**
- Create: `src/app/painel/visao-geral/page.tsx`, `src/components/dashboard/{stat-tiles.tsx,day-bars.tsx,top-services.tsx,per-professional.tsx,pending-review.tsx,month-switcher.tsx}`, `src/server/panel/roles.ts`
- Modify: `src/components/panel/panel-nav.tsx` e `src/app/painel/mais/page.tsx` (itens por papel e item "Plataforma" para super-admin), `src/components/panel/panel-shell.tsx` (recebe `role` e `isSuperAdmin`), `src/app/painel/layout.tsx`, páginas `servicos`, `equipe`, `configuracoes` (guarda de papel)
- Test: `tests/panel/roles.test.ts`, `tests/app/dashboard-page.test.ts`, `tests/e2e/dashboard.spec.ts`

**Interfaces:**
- `navItemsFor(role: "owner"|"reception"|"staff", isSuperAdmin: boolean): { sidebar: NavItem[]; bottom: NavItem[] }` (pura, em `src/server/panel/roles.ts` ou `src/lib/panel-nav.ts`), seguindo "Menu do painel por papel" de `docs/design/telas/plano-3.md`; no celular, recepção e profissional ficam com Agenda, Clientes e Mais.
- `requirePanelRole(allowed: Array<"owner"|"reception"|"staff">)` — usa `requireOnboarded()` e redireciona para `/painel` quando o papel não está em `allowed`. `visao-geral` e `configuracoes`: `["owner"]`; `servicos` e `equipe`: `["owner","reception"]`.
- Mês por `?mes=yyyy-MM` (inválido → mês atual). "Revisar agora" usa as ações já existentes `completeBookingAction` e `noShowBookingAction` de `src/app/painel/actions.ts`.
- Gráfico: barras em HTML/CSS (passado sólido `--primary`, futuro listrado com borda), `role="img"` com `aria-label` resumindo o mês, tooltip por barra (hover e foco), legenda de 2 itens, rótulo "Hoje"; tabela escondida para leitores de tela com dia e contagem.
- [ ] **Step 1: Testes que falham:** `navItemsFor` para cada papel (proprietário 6 itens, recepção 4, profissional 2; super-admin ganha "Plataforma"); página `visao-geral` chama `requirePanelRole(["owner"])` (guarda estática) e `configuracoes` também; e2e: proprietário vê os números de um tenant semeado com valores conhecidos (R$ formatado), marca 1 pendente como Atendido e o aviso diminui; usuário recepção que abre `/painel/visao-geral` cai em `/painel`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Telas seguindo `Main.dc.html` e `PainelCelular.dc.html` (+ estados de `docs/design/telas/plano-3.md`).
- [ ] **Step 4:** Verdes + build; capturas 390px/1440px claro/escuro; commit `feat: visão geral do mês e menu por papel`.

### Task 6: Acessos da equipe (servidor)

**Files:**
- Create: `src/server/team/invitations.ts`, `src/server/team/members.ts`, `src/server/team/accept.ts`
- Modify: `src/server/email/templates.ts` (`inviteLink(token)`, `buildInviteEmail`), `src/server/auth/google.ts` (aceitar convite pendente depois do login com Google), `src/server/security/limits.ts` (limites de convite)
- Test: `tests/team/invitations.test.ts`, `tests/team/accept.test.ts`, `tests/team/members.test.ts`, `tests/email/templates.test.ts`

**Interfaces:**
- `INVITE_TTL_DAYS = 7`.
- `type MemberRow = { kind: "member"; userId; name; email; role; professionalName: string | null } | { kind: "invite"; invitationId; name; email; role; professionalName: string | null; sentAt: Date; expired: boolean }`.
- `listTeamAccess(db, tenantId): Promise<MemberRow[]>` (proprietário primeiro, depois membros, depois convites pendentes não revogados).
- `inviteMember(db, actor /* owner */, input: { name; email; role: "reception"|"staff"; professionalId?: string }, now?): Promise<{ invitationId; token }>` — erros (`TeamError`, códigos e mensagens): e-mail já é membro deste estabelecimento → "Essa pessoa já tem acesso."; e-mail com vínculo em outro estabelecimento → "Esse e-mail já está ligado a outro estabelecimento."; `staff` sem `professionalId` ou com profissional inativo/já ligado a um usuário → validação no campo; convite pendente para o mesmo e-mail é revogado e substituído.
- `createOwnerAccessInvite(db, tenantId, invitedByUserId, now?)` (usado pela Task 8): convite `owner` para o dono atual, sem senha ainda.
- `resendInvitation`, `revokeInvitation(db, actor, invitationId)`; `removeMember(db, actor, userId)` — apaga o vínculo e as sessões do usuário nesse estabelecimento, solta `professionals.user_id`; o proprietário não pode ser removido.
- Envio: `sendInviteEmail(invitation, token)` via `sendEmail`; assunto "{Estabelecimento} convidou você para a agenda" (owner: "Sua agenda na Eneven está pronta").
- `type InvitationView = { status: "valid"; tenantName; role; email; name; hasAccount: boolean } | { status: "invalid" }`.
- `getInvitation(db, token, now?)` (busca pelo hash, fora do RLS) e `acceptInvitation(db, token, input: { userId: string } | { name: string; password: string }, now?): Promise<{ userId; tenantId }>` — transação com `FOR UPDATE` no convite: cria usuário (com `emailVerifiedAt = now`) ou usa o da sessão (o e-mail da sessão precisa ser o do convite, senão "Entre com {e-mail} para aceitar."), cria o vínculo, liga `professionals.user_id` (staff), marca `acceptedAt`; convite `owner`: define a senha do dono e confirma o e-mail; segundo aceite, vencido ou revogado → `invalid`.
- [ ] **Step 1: Testes que falham:** convidar recepção → `listTeamAccess` mostra "invite"; aceitar com nome+senha cria usuário verificado, vínculo `reception` e a sessão só enxerga esse tenant; aceitar staff liga `professionals.user_id` e `scopedProfessionalId` passa a devolver o profissional; aceite duplo concorrente (dois `acceptInvitation` em paralelo no `tests/pg`) → um ok, outro `invalid`; vencido (8 dias) → `invalid`; e-mail de outro estabelecimento → erro com a mensagem exata; recepção chamando `inviteMember` → forbidden; `removeMember` apaga sessões do removido; e-mail do convite contém o link `/convite/{token}` e escapa o nome do estabelecimento.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar; senha com as mesmas regras e hash do cadastro; rate limit no aceite (por IP) e no envio (por estabelecimento: 20 convites/dia).
- [ ] **Step 4:** Verdes (`pnpm test && pnpm test:pg && pnpm typecheck && pnpm lint`); commit `feat: convites e acessos da equipe`.

### Task 7: Acessos da equipe (telas)

**Files:**
- Create: `src/app/convite/[token]/page.tsx`, `src/app/convite/[token]/actions.ts`, `src/components/settings/team-access-card.tsx`, `src/components/settings/invite-dialog.tsx`
- Modify: `src/app/painel/configuracoes/page.tsx` e `actions.ts`, `src/app/painel/equipe/page.tsx` (coluna/indicador "Tem acesso" no profissional ligado a usuário), fluxo de login (`src/app/(auth)/…`) para voltar ao convite com `?convite=` depois de entrar
- Test: `tests/team/actions.test.ts`, `tests/e2e/invite.spec.ts`

**Interfaces:**
- Consome Task 6. Ações do cartão: `inviteMemberAction`, `resendInvitationAction`, `revokeInvitationAction`, `removeMemberAction` (só proprietário).
- `/convite/[token]`: dinâmico, `noindex`, `Referrer-Policy: no-referrer` (como `/agendamento`); estados e textos de "Aceitar convite" em `docs/design/telas/plano-3.md`; ao aceitar, cria a sessão no tenant do convite e redireciona para `/painel`.
- [ ] **Step 1: Testes que falham:** ações recusam recepção; e2e: proprietário convida "Bia" como Profissional ligada à profissional Bia → abre o link (token obtido por uma ação nova `invite-token` da rota de apoio `/api/e2e/seed`, que devolve o token do último convite do tenant; o envio de e-mail em desenvolvimento só vai para o console) → cria senha → cai no painel só com Agenda e Clientes e vê só os agendamentos da Bia → proprietário remove o acesso → próxima navegação da Bia vai para `/entrar`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Telas.
- [ ] **Step 4:** Verdes + build; capturas; commit `feat: telas de acessos da equipe e aceite de convite`.

### Task 8: Plataforma (servidor), suporte e somente leitura

**Files:**
- Create: `src/server/platform/{tenants.ts,metrics.ts,actions.ts,plans.ts,support.ts}`
- Modify: `src/server/auth/session.ts` (`SessionInfo.support`), `src/server/auth/guard.ts`, `src/server/tenants/release.ts` (`tenantSituation`), `src/server/agenda/panel-ops.ts` e `src/server/agenda/errors.ts` (bloqueio de escrita em somente leitura), `scripts/create-super-admin.ts` (`--promote`)
- Test: `tests/platform/{tenants,metrics,actions,plans,support}.test.ts`, `tests/agenda/read-only.test.ts`, `tests/auth/session.test.ts` (casos novos)

**Interfaces:**
- `type TenantSituation = "trial" | "trial_expired" | "active" | "past_due" | "read_only" | "canceled"`; `tenantSituation(t: { status; trialEndsAt }, now?): TenantSituation` em `release.ts` (pura).
- `listPlatformTenants(db, input: { situation?: TenantSituation; query?: string; page: number; now?: Date }): Promise<{ items: Array<{ id; name; slug; ownerName; ownerEmail; situation; trialEndsAt; planName; bookings30d: number; ownerLastLoginAt: Date | null; createdAt }>; total; counts: Record<TenantSituation | "all", number> }>` — busca em nome, slug e e-mail do dono; ordem `created_at desc`; 50 por página.
- `getPlatformMetrics(db, now?): Promise<{ mrrCents; activeCount; trialCount; trialEndingIn7Days; conversion: { converted: number; finished: number; rate: number | null }; bookings30d: number; publicShare: number | null }>` — MRR = soma de `plans.price_cents` dos `active`; conversão = `activated_at` não nulo ÷ (teste terminado ou `activated_at` não nulo).
- `getPlatformTenant(db, tenantId, now?)` — dados, dono (`emailVerified`, `hasPassword`, `lastLoginAt`, convite de dono pendente), uso (agendamentos 30 dias, clientes, profissionais ativos de `maxProfessionals`, serviços ativos), últimas 20 linhas do `audit_log`.
- `type AdminActor = { userId: string }`. Ações (todas gravam `audit_log` com `action` em inglês, ex. `tenant.trial_extended`): `changePlan(db, actor, tenantId, planId)`, `extendTrial(db, actor, tenantId, days: 7|14|30, now?)` (`trial_ends_at = max(now, trial_ends_at) + dias`; se estava `read_only` por teste vencido e nunca ativou, volta a `trial`), `activateTenant` (`status = active`, `activated_at ??= now`), `blockTenant` (`read_only`), `cancelTenant` (`canceled`), `createTenantByAdmin(db, actor, input: { businessName; ownerName; ownerEmail; whatsapp; planId; trialDays: number /* 1–90 */ })` (usa `createTenantWithOwner` com `passwordHash: null`, `emailVerifiedAt: null`, ajusta `trial_ends_at` e o plano).
- `listPlans(db)` com contagem de estabelecimentos; `updatePlan(db, actor, planId, input: { name; priceCents; maxProfessionals: number | null; monthlyMessages; active })` (validação zod; plano em uso não pode ser desativado sem aviso: desativar só esconde da escolha).
- Suporte: `startSupport(db, sessionToken, actor, tenantId, now?)` grava `sessions.tenant_id = alvo`, `support_started_at = now` e `audit_log` `support.started`; `endSupport(db, sessionToken, actor, now?)` volta `tenant_id` para `resolveLoginTenantId(user)`, limpa `support_started_at` e grava `support.ended` com `details.minutes`. `getSession` passa a devolver `support: boolean`; com `support_started_at` preenchido **e** `isSuperAdmin`, o papel é `owner` mesmo sem vínculo (sem super-admin, a sessão de suporte não vale nada: `role = null`).
- Somente leitura: `createPanelBooking`, `rescheduleBookingAsStaff` e `createBlock` lançam `BookingError("read_only", "Sua agenda está em modo somente leitura.")` quando `!isTenantActive(tenant)`; cancelar e marcar resultado continuam permitidos.
- `scripts/create-super-admin.ts --promote <e-mail>`: marca `is_super_admin = true` num usuário existente (sem senha), para a conta do Ricardo.
- [ ] **Step 1: Testes que falham:** `tenantSituation` para os 6 casos; métricas com tenants semeados (2 ativos Essencial + 1 Studio → MRR 18.970; conversão 3 de 5); `extendTrial` de teste vencido em `read_only` sem `activated_at` volta a `trial` com prazo `now + 7d`; cada ação grava `audit_log`; `createTenantByAdmin` com e-mail existente → erro "Já existe uma conta com esse e-mail."; sessão de suporte: `getSession` devolve `tenantId` do alvo, `role: "owner"`, `support: true`; o mesmo registro com usuário sem super-admin → `role: null`; `endSupport` devolve o tenant do Ricardo e grava minutos; `destroySession` durante suporte apaga a sessão; tenant `read_only` → `createPanelBooking` lança `read_only`, `cancelBookingAsStaff` funciona; `--promote` marca o usuário (teste do script com `createTestDb`).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Verdes (incluindo `pnpm test:pg`); commit `feat: plataforma, suporte e modo somente leitura`.

### Task 9: Plataforma (telas), faixas de suporte e somente leitura

**Files:**
- Create: `src/app/admin/layout.tsx`, `src/app/admin/actions.ts`, `src/app/admin/estabelecimentos/novo/page.tsx`, `src/app/admin/estabelecimentos/[id]/page.tsx`, `src/app/admin/planos/page.tsx`, `src/components/platform/*`, `src/components/panel/support-banner.tsx`, `src/components/panel/read-only-banner.tsx`
- Modify: `src/app/admin/page.tsx` (lista), `src/app/painel/layout.tsx` (faixas), `src/components/agenda/*` (desabilitar novo agendamento/remarcar/bloqueio em somente leitura), `.env.example` e README (`SUPPORT_WHATSAPP`, promoção do super-admin)
- Test: `tests/app/admin-pages.test.ts` (guarda estática: toda página de `/admin` chama `requireSuperAdminSession(`), `tests/platform/admin-actions.test.ts`, `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consome Task 8. Ações de `/admin` revalidam `requireSuperAdminSession()` em cada chamada e devolvem `{ ok, message } | { ok: false, error }`; "Entrar como" chama `startSupport` e redireciona para `/painel`; "Voltar à plataforma" (faixa) chama `endSupport` e volta a `/admin/estabelecimentos/{id}`.
- "Enviar acesso por e-mail" chama `createOwnerAccessInvite` + `sendInviteEmail` (Task 6).
- `SUPPORT_WHATSAPP` (opcional, `55…`): botão "Falar com a Eneven" na faixa de somente leitura.
- [ ] **Step 1: Testes que falham:** guarda estática do `/admin`; ação de admin chamada por proprietário comum → redireciona/nega; e2e: super-admin vê a lista com filtro por situação → abre um estabelecimento → estende o teste (+7) e o histórico mostra a linha → "Entrar como" → faixa de suporte no painel do salão → "Voltar à plataforma" → de volta ao detalhe; tenant bloqueado mostra a faixa de somente leitura e o botão "Novo agendamento" desabilitado.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Telas seguindo `Admin.dc.html`, `AdminDetalhe.dc.html` e as telas sem mockup de `docs/design/telas/plano-3.md`.
- [ ] **Step 4:** Verdes + build; capturas 1440px e 390px; commit `feat: painel da plataforma`.

### Task 10: E2E estável no CI e fechamento

**Files:**
- Modify: `playwright.config.ts`, `scripts/e2e-server.mjs`, `tests/e2e/*.spec.ts`, `.github/workflows/ci.yml` (job `e2e`), `README.md`, `docs/superpowers/plans/2026-10-27-plano-3-pendencias.md` (novo)
- Delete: `tests/e2e/task9-shots.spec.ts`, `tests/e2e/agenda-shots.spec.ts`, `tests/e2e/shots.spec.ts` (capturas viram script em `scripts/`, fora da suíte)

**Interfaces:**
- Cada spec semeia o próprio estabelecimento (nome único por teste) e nunca depende de dados de outro spec; nada de horários fixos que possam cair no passado: datas relativas a "amanhã no fuso de São Paulo".
- Job `e2e` no CI: o mesmo `scripts/e2e-server.mjs` de hoje (servidor de desenvolvimento com PGlite próprio; a rota de apoio continua desligada em `NODE_ENV=production`, e isso não muda), `pnpm exec playwright install --with-deps chromium`, `pnpm test:e2e`; artefato com os traces em caso de falha.
- [ ] **Step 1:** Rodar `pnpm test:e2e` 3 vezes seguidas localmente e anotar as falhas intermitentes (o caso do `agenda.spec` do Plano 2, Ruling P16) com a causa encontrada (`superpowers:systematic-debugging`).
- [ ] **Step 2:** Corrigir a causa (isolamento por spec, esperas por estado e não por tempo) até 3 execuções seguidas verdes.
- [ ] **Step 3:** Ligar o job `e2e` no CI e ver verde no GitHub.
- [ ] **Step 4:** README (clientes, visão geral, acessos, plataforma, `--promote`, `SUPPORT_WHATSAPP`) e o arquivo de pendências com as decisões tomadas. Já entram como pendências conhecidas: uso da franquia de lembretes na visão geral e mensagens/custo de WhatsApp nas métricas da plataforma (Plano 4); limite de profissionais por plano e carência de 7 dias do pagamento atrasado (Plano 5); escolha de estabelecimento para quem tem vínculo com mais de um (convite recusa esse caso por enquanto); commit `test: e2e estável no CI e documentação do Plano 3`.

## Depois do merge (com OK do Ricardo em cada passo do Easypanel)

- Backup do banco antes do deploy; deploy; conferir as migrações `0004`/`0005` aplicadas e `plan_id` preenchido.
- Promover a conta do Ricardo com `node dist/create-super-admin.mjs --promote <e-mail dele>` pelo console do serviço.
- Conferir `/admin` (lista e métricas), "Entrar como" e volta, e o próprio painel dele com Clientes e Visão geral.
