# Plano 4 — Lembretes e Notificações por WhatsApp (WhatsApp Cloud API)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O sistema passa a enviar lembretes e notificações automáticas via WhatsApp oficial (Cloud API da Meta) usando um número central da plataforma, templates de utilidade aprovados, webhook para recebimento de status e respostas interativas com botões (Confirmar / Remarcar / Cancelar), controle estrito de franquia mensal por plano/estabelecimento, proteção da cota diária de 250 destinatários da Meta, painel de configurações para o salão e métricas de consumo e custo para o super-admin.

**Architecture:** 
- **Canal Plugável:** A comunicação com o WhatsApp é abstraída pela interface `WhatsAppChannel`, com implementação primária `MetaCloudApiChannel` (`https://graph.facebook.com/v21.0/{phone_number_id}/messages`) e implementação de mock/teste `FakeWhatsAppChannel`.
- **Fila e Agendamento no Postgres:** Disparos de lembretes (véspera e 2h antes) e notificações imediatas (confirmação, cancelamento, remarcação) passam por uma fila transacional `whatsapp_queue` com processamento atômico (`FOR UPDATE SKIP LOCKED`) e histórico auditável `whatsapp_messages`.
- **Proteção de Cotas:**
  1. *Cota Meta:* Monitoramento de destinatários únicos na janela deslizante de 24h (teto de 250), priorizando lembretes de véspera e alertando o super-admin ao atingir 70% (175 destinatários).
  2. *Franquia do Tenant:* Checagem de consumo mensal baseada no plano (`plans.monthly_messages`: Essencial 300, Profissional 800, Studio 1500; teste: 50). Se a franquia for atingida, os envios automáticos pausam e o painel exibe aviso, liberando o botão de envio manual via `wa.me/`.
- **Webhook Meta:** Rota `/api/webhooks/whatsapp` com validação `hub.verify_token` (GET) e assinatura HMAC-SHA256 `X-Hub-Signature-256` (POST) usando `timingSafeEqual`. Processa confirmação/cancelamento automático via cliques nos botões e responde mensagens livres com o link direto do salão.

**Tech Stack:** Next.js (App Router), PostgreSQL + Drizzle ORM, Zod, Meta Graph API v21.0, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-24-eneven-agenda-inteligente-design.md` (§8 Lembretes por WhatsApp, §7.2 Notificação e Dashboard, §7.3 Painel do super-admin, §9 Planos e franquias, §194 Jobs e worker no Postgres).

---

## Global Constraints

- Padrões dos Planos 1, 2 e 3 mantidos (código e identificadores em inglês, interface e logs amigáveis em pt-BR, rotas públicas/painel em português, `getDb()`, `createTestDb()`, `withTenant` para isolamento de tenants, dinheiro em centavos, fuso do estabelecimento).
- Antes de alterar ou criar rotas Next.js, consultar documentação e convenções locais.
- **Canal Plugável Obrigatório:** Nenhuma chamada direta ao `fetch("https://graph.facebook.com...")` espalhada pelo código. Todo envio deve passar pelo motor `src/server/whatsapp/*`.
- **Proibido uso de APIs não-oficiais (Evolution, Baileys, etc.):** Apenas a WhatsApp Cloud API oficial da Meta.
- **Segredos protegidos:** `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` vêm de variáveis de ambiente do servidor, nunca commitados e nunca vazados para o cliente.
- **Deduplicação e Idempotência:** Uma mensagem para o mesmo agendamento e tipo de evento nunca pode ser enfileirada ou disparada mais de uma vez.
- **Falha de Envio Não Derruba Agendamento:** Se o envio do WhatsApp falhar ou a cota esgotar, o agendamento em si continua válido e concluído com sucesso.

---

## Review Focus

1. **Validação Estrita de Assinatura no Webhook:** Rejeitar qualquer POST sem cabeçalho `X-Hub-Signature-256` válido com timing seguro (`timingSafeEqual`) contra `WHATSAPP_APP_SECRET` (Task 3).
2. **Concorrência e Duplo Envio na Fila:** Garantir que execuções simultâneas do worker nunca disparem a mesma mensagem duas vezes para o mesmo cliente (Task 4).
3. **Respeito aos Fusos Horários no Scheduler:** Lembrete de véspera (enviado às ~18h do dia anterior) e lembrete de 2h devem considerar estritamente o `timezone` do estabelecimento (Task 4).
4. **Isolamento de Franquia:** Um estabelecimento nunca pode consumir a franquia de outro, e o papel `staff` não pode alterar as configurações de lembretes (Tasks 5 e 6).
5. **Transição Suave para Envio Manual:** Ao esgotar a franquia (100%), o sistema não quebra: apenas suspende o envio automático, notifica no painel e orienta o uso do link `wa.me/` (Task 6).

---

### Task 1: Esquema de Banco de Dados e Migrações

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0006_whatsapp.sql`
- Test: `tests/db/whatsapp-schema.test.ts`, `tests/pg/whatsapp-schema.test.ts`

**Interfaces & Estrutura:**
- Enum `whatsapp_message_status`: `'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed'`
- Enum `whatsapp_template_type`: `'booking_created' | 'reminder_eve' | 'reminder_2h' | 'rescheduled' | 'canceled'`
- Tabela `tenant_notification_settings`:
  - `tenantId uuid pk fk tenants(id) on delete cascade`
  - `bookingCreated boolean not null default true`
  - `reminderEve boolean not null default true`
  - `reminder2h boolean not null default false` (desligado por padrão, recurso do plano Profissional/Studio)
  - `rescheduled boolean not null default true`
  - `canceled boolean not null default true`
  - `updatedAt timestamptz not null default now()`
  - RLS: `tenant_isolation` + grants para `agenda_app`.
- Tabela `whatsapp_messages`:
  - `id uuid pk default gen_random_uuid()`
  - `tenantId uuid not null fk tenants(id) on delete cascade`
  - `bookingId uuid fk bookings(id) on delete set null`
  - `direction text not null default 'outbound'` (`outbound | inbound`)
  - `templateType whatsapp_template_type null`
  - `recipientPhone text not null`
  - `recipientName text null`
  - `wamId text unique` (ID retornado pela Meta)
  - `status whatsapp_message_status not null default 'queued'`
  - `failureCode text null`
  - `failureReason text null`
  - `sentAt timestamptz null`
  - `deliveredAt timestamptz null`
  - `readAt timestamptz null`
  - `createdAt timestamptz not null default now()`
  - Índices: `(tenant_id, created_at)`, `(wam_id)`, `(recipient_phone, created_at)`
  - RLS: `tenant_isolation` + grants para `agenda_app`.
- Tabela `whatsapp_queue`:
  - `id uuid pk default gen_random_uuid()`
  - `tenantId uuid not null fk tenants(id) on delete cascade`
  - `bookingId uuid not null fk bookings(id) on delete cascade`
  - `templateType whatsapp_template_type not null`
  - `scheduledFor timestamptz not null`
  - `attempts integer not null default 0`
  - `lockedUntil timestamptz null`
  - `processedAt timestamptz null`
  - `errorMessage text null`
  - `createdAt timestamptz not null default now()`
  - Constraint UNIQUE: `(tenant_id, booking_id, template_type)` garantindo idempotência absoluta.
  - Índices: `(scheduled_for, processed_at, locked_until)`
  - RLS: `tenant_isolation` + grants para `agenda_app`.

**Checklist:**
- [x] **Step 1:** Escrever testes que falham para o novo schema e constraints de isolamento RLS.
- [x] **Step 2:** `pnpm test tests/db` → FAIL.
- [x] **Step 3:** Atualizar `src/db/schema.ts`, gerar migração `drizzle/0006_wonderful_pepper_potts.sql` com políticas RLS completas e grants.
- [x] **Step 4:** Validar com `pnpm test && pnpm test:pg` → PASS. Commit `feat(whatsapp): esquema e migração para notificações e fila`.

---

### Task 2: Cliente Oficial WhatsApp Cloud API & Template Engine

**Files:**
- Create: `src/server/whatsapp/types.ts`, `src/server/whatsapp/channel.ts`, `src/server/whatsapp/templates.ts`, `src/server/whatsapp/client.ts`, `src/server/whatsapp/fake-client.ts`
- Test: `tests/whatsapp/templates.test.ts`, `tests/whatsapp/client.test.ts`

**Interfaces:**
- `interface WhatsAppChannel`:
  - `sendTemplate(to: string, template: TemplatePayload): Promise<SendResult>`
  - `sendTextMessage(to: string, text: string): Promise<SendResult>`
- `type SendResult = { ok: true; wamId: string } | { ok: false; error: string; code?: string }`
- Templates oficiais de categoria utilidade:
  1. `booking_created`: Parâmetros: `{{1}}` (nome cliente), `{{2}}` (estabelecimento), `{{3}}` (serviço), `{{4}}` (profissional), `{{5}}` (data), `{{6}}` (hora), `{{7}}` (link gerenciar).
  2. `booking_reminder_eve`: Mesmos parâmetros + botões interativos `quick_reply`: [Confirmar], [Remarcar], [Cancelar].
  3. `booking_reminder_2h`: Lembrete curto com botões rápidos.
  4. `booking_rescheduled`: Informando nova data/hora.
  5. `booking_canceled`: Notificando cancelamento.
- Formatação de telefone internacional (E.164: Brasil `55 + DDD + 9 dígitos`).
- Modo de simulação (`FakeWhatsAppChannel`) quando `WHATSAPP_API_TOKEN` não estiver configurado ou em ambiente de teste/desenvolvimento.

**Checklist:**
- [ ] **Step 1:** Testes unitários para renderização de parâmetros de cada template e normalização de números para a API Graph.
- [ ] **Step 2:** Testes para o cliente HTTP Meta tratando sucesso (200 com `messages[0].id`) e erros da Meta (400, 401, 429, limites de rate limit).
- [ ] **Step 3:** Implementar `MetaCloudApiClient` e `FakeWhatsAppChannel`.
- [ ] **Step 4:** `pnpm test tests/whatsapp` → PASS. Commit `feat(whatsapp): cliente Meta Cloud API e engine de templates`.

---

### Task 3: Webhook Oficial da Meta (Recebimento, Assinatura e Resposta Interativa)

**Files:**
- Create: `src/app/api/webhooks/whatsapp/route.ts`, `src/server/whatsapp/webhook.ts`, `src/server/whatsapp/interactive-actions.ts`
- Test: `tests/whatsapp/webhook.test.ts`, `tests/whatsapp/signature.test.ts`

**Interfaces & Regras:**
- `GET /api/webhooks/whatsapp`:
  - Valida `hub.mode === 'subscribe'` e `hub.verify_token === process.env.WHATSAPP_VERIFY_TOKEN`.
  - Retorna o `hub.challenge` como texto puro com status 200.
- `POST /api/webhooks/whatsapp`:
  - Extrai cabeçalho `X-Hub-Signature-256`.
  - Valida HMAC-SHA256 do corpo bruto (`rawBody`) com a chave secreta `WHATSAPP_APP_SECRET` usando `timingSafeEqual`. Retorna 401 se inválido.
  - Processa eventos assíncronos:
    1. **Status de entrega (`statuses`):** Atualiza registro em `whatsapp_messages` para `sent`, `delivered`, `read` ou `failed` com timestamp e código de erro.
    2. **Interação com botões (`messages` com `button_reply`):**
       - Payload do botão contém `{ action: "confirm" | "cancel" | "reschedule", bookingId, token }`.
       - `confirm`: Altera status do agendamento para `confirmed`.
       - `cancel`: Se respeitar antecedência mínima do estabelecimento, altera para `canceled`.
       - `reschedule`: Envia mensagem automática com o link de gerenciamento para o cliente escolher o novo horário.
    3. **Mensagem livre de texto:** Responde educadamente com mensagem de utilidade contendo o link do WhatsApp direto do salão (`wa.me/{phone}`).

**Checklist:**
- [ ] **Step 1:** Testes que simulam payloads oficiais da Meta (GET challenge, POST status delivery, POST button reply).
- [ ] **Step 2:** Testes de segurança garantindo rejeição de assinaturas HMAC forjadas ou sem segredo.
- [ ] **Step 3:** Implementar a rota do webhook e processador de ações interativas.
- [ ] **Step 4:** `pnpm test tests/whatsapp/webhook.test.ts` → PASS. Commit `feat(whatsapp): rota de webhook oficial com assinatura HMAC e ações interativas`.

---

### Task 4: Motor de Fila, Scheduler de Lembretes e Gestão de Cotas

**Files:**
- Create: `src/server/whatsapp/queue.ts`, `src/server/whatsapp/scheduler.ts`, `src/server/whatsapp/quota.ts`, `src/app/api/cron/whatsapp/route.ts`
- Test: `tests/whatsapp/queue.test.ts`, `tests/whatsapp/quota.test.ts`, `tests/whatsapp/scheduler.test.ts`

**Interfaces & Regras:**
- `checkTenantQuota(db, tenantId, month): Promise<{ allowed: boolean; used: number; total: number }>`:
  - Compara contagem de mensagens do mês com `plans.monthly_messages` (ou 50 para planos em teste).
- `checkMetaDailyLimit(db): Promise<{ count: number; allowed: boolean; warnSuperAdmin: boolean }>`:
  - Destinatários únicos nas últimas 24h. Limite: 250. Alerta em 175 (70%).
- `scheduleRemindersForTenant(db, tenantId, now): Promise<number>`:
  - Busca agendamentos `scheduled` e `confirmed`.
  - Véspera: se amanhã no fuso do salão houver atendimento e o horário for entre 18h e 20h locais, enfileira `reminder_eve`.
  - 2 Horas: se o plano for Profissional/Studio e o tenant tiver ativado `reminder2h`, enfileira `reminder_2h`.
- `processQueue(db, maxBatch = 20): Promise<{ processed: number; sent: number; failed: number }>`:
  - Seleciona itens pendentes com `FOR UPDATE SKIP LOCKED`.
  - Verifica quota antes de disparar. Se estourada, marca como `failed` com motivo `quota_exceeded`.
  - Dispara via `WhatsAppChannel` e atualiza `whatsapp_messages` e `whatsapp_queue`.
- Endpoint de trigger de cron `/api/cron/whatsapp` protegido por cabeçalho de autorização `CRON_SECRET`.

**Checklist:**
- [ ] **Step 1:** Testes para cálculo de fuso horário e agendamento de lembretes na véspera (ex: atendimento às 09h em São Paulo gera lembrete às 18h da véspera).
- [ ] **Step 2:** Testes de concorrência com workers simulados processando a fila em paralelo sem duplicar disparos.
- [ ] **Step 3:** Testes de trava de cota (mensagens bloqueadas ao atingir 300 no plano Essencial).
- [ ] **Step 4:** Implementar motor de fila e scheduler. Commit `feat(whatsapp): fila transacional, scheduler de lembretes e controle de cotas`.

---

### Task 5: Integração com o Fluxo de Agendamentos

**Files:**
- Modify: `src/server/agenda/bookings.ts`, `src/server/agenda/panel-ops.ts`
- Test: `tests/agenda/whatsapp-triggers.test.ts`

**Regras de Negócio:**
- Na criação do agendamento (`createBooking` público ou no painel):
  - Se `tenant_notification_settings.bookingCreated` for verdadeiro e o estabelecimento tiver cota, enfileira disparo imediato de `booking_created`.
  - Enfileira automaticamente o lembrete de véspera `reminder_eve` para a data/hora calculada.
- Na remarcação (`rescheduleBooking`):
  - Enfileira `booking_rescheduled`.
  - Recalcula e atualiza o horário agendado de `reminder_eve` e `reminder_2h`.
- No cancelamento (`cancelBooking`):
  - Enfileira `booking_canceled`.
  - Remove/cancela lembretes futuros pendentes da fila para aquele agendamento.
- Tratamento de erro resiliente: Falha ao enfileirar não cancela a transação principal do agendamento.

**Checklist:**
- [ ] **Step 1:** Escrever testes cobrindo criação, remarcação e cancelamento com verificação da fila de WhatsApp.
- [ ] **Step 2:** `pnpm test tests/agenda/whatsapp-triggers.test.ts` → FAIL.
- [ ] **Step 3:** Integrar os disparos nas rotas de mutação de agendamento.
- [ ] **Step 4:** Validar com toda a suíte de testes de agenda → PASS. Commit `feat(whatsapp): gatilhos de notificação integrados ao ciclo de vida do agendamento`.

---

### Task 6: Painel do Estabelecimento — Configurações de Mensagens e Franquia

**Files:**
- Create: `src/app/painel/configuracoes/mensagens/page.tsx`, `src/app/painel/configuracoes/mensagens/actions.ts`, `src/components/settings/whatsapp-settings-card.tsx`, `src/components/dashboard/whatsapp-usage-card.tsx`
- Modify: `src/app/painel/configuracoes/page.tsx`, `src/app/painel/visao-geral/page.tsx`, `src/components/agenda/booking-detail.tsx`
- Test: `tests/app/whatsapp-settings-page.test.ts`, `tests/settings/whatsapp-actions.test.ts`

**Interface do Salão:**
- Tela de Configuração de Mensagens:
  - Lista de templates com switches para ativar/desativar:
    - Confirmação de novo agendamento
    - Lembrete na véspera
    - Lembrete 2h antes (com aviso de que exige plano Profissional ou Studio)
    - Aviso de remarcação e cancelamento
  - Card de status da Franquia Mensal:
    - Barra de progresso visual (ex: `142 de 300 mensagens usadas`).
    - Alertas visuais: amarelo aos 80%, vermelho aos 100% ("Franquia esgotada").
- Na Visão Geral (`/painel/visao-geral`):
  - Tile com indicador de mensagens do mês e taxa de confirmação via WhatsApp.
- No Detalhe do Agendamento (`booking-detail.tsx`):
  - Histórico de lembretes enviados para aquele atendimento (ícone de enviado, entregue ou lido).
  - Botão alternativo "Lembrar no WhatsApp" (`wa.me/`) pré-configurado, permitindo envio manual quando a franquia estiver esgotada.

**Checklist:**
- [ ] **Step 1:** Testes de permissão (apenas `owner` pode alterar configurações de mensagens; `staff` e `reception` não podem).
- [ ] **Step 2:** Testes de Server Actions para salvar preferências de notificação.
- [ ] **Step 3:** Implementar componentes e telas seguindo o sistema visual oficial (`sistema-visual.md`).
- [ ] **Step 4:** `pnpm test` e `pnpm build` verdes. Commit `feat(whatsapp): telas de configuração de mensagens e consumo de franquia no painel`.

---

### Task 7: Plataforma / Super-Admin — Monitoramento da Meta e Franquias

**Files:**
- Create: `src/components/platform/whatsapp-metrics-card.tsx`
- Modify: `src/app/admin/page.tsx`, `src/server/platform/metrics.ts`, `src/server/platform/tenants.ts`
- Test: `tests/platform/whatsapp-metrics.test.ts`

**Interface do Ricardo (/admin):**
- Métricas globais da plataforma:
  - **Uso da Cota Diária da Meta (250 destinatários/24h):** Termômetro em tempo real com indicador de status (Verde < 175, Laranja 175–225 com alerta "70% do limite atingido", Vermelho > 225).
  - **Total de Mensagens Enviadas no Mês:** Contagem acumulada.
  - **Custo Estimado da Meta:** Calculado automaticamente (`mensagens * R$ 0,035`).
- Na lista de estabelecimentos (`/admin`):
  - Coluna de consumo de WhatsApp (`180/300 msg`) com filtro/alerta de estabelecimentos com franquia estourada.

**Checklist:**
- [ ] **Step 1:** Testes para cálculo de métricas de WhatsApp e agrupamento de custo da Meta.
- [ ] **Step 2:** Atualizar consultas agregadas da plataforma em `src/server/platform/metrics.ts`.
- [ ] **Step 3:** Atualizar componentes visuais do dashboard `/admin`.
- [ ] **Step 4:** Validar com `pnpm test tests/platform` → PASS. Commit `feat(whatsapp): métricas de envio, custo e limites da Meta no painel super-admin`.

---

### Task 8: Testes Automatizados E2E e Suíte Completa de Regressão

**Files:**
- Create: `tests/e2e/whatsapp-flow.spec.ts`
- Modify: `src/server/e2e/seed.ts`
- Test: Suíte completa local (`pnpm test && pnpm test:pg && pnpm test:e2e`)

**Cenários E2E (Playwright):**
1. Cliente agenda serviço na página pública → mensagem de confirmação gerada na fila.
2. Webhook recebe status `delivered` e `read` da Meta → ícones atualizados no painel do salão.
3. Simulação de lembrete de véspera enviado → webhook recebe clique no botão "Confirmar" → status do agendamento passa para `confirmed` em tempo real.
4. Estabelecimento atinge 100% da franquia → envio automático para o próximo agendamento é pausado com log `quota_exceeded` e botão `wa.me/` fica em destaque no painel.

**Checklist:**
- [ ] **Step 1:** Implementar sementes de apoio e2e para simular estados de fila e webhook.
- [ ] **Step 2:** Executar spec e2e de WhatsApp em 390px e 1280px.
- [ ] **Step 3:** Rodar suíte completa: `pnpm lint`, `pnpm typecheck`, unitários, pg e e2e.
- [ ] **Step 4:** Documentar decisões e pendências do Plano 4 em `docs/superpowers/plans/2026-10-29-plano-4-pendencias.md`. Commit `test(whatsapp): testes de ponta a ponta e validação do fluxo completo de WhatsApp`.
