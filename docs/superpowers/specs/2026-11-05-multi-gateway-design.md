# Vários provedores de pagamento: Mercado Pago e Stripe (plano)

Data: 05/11/2026. Decisão do Ricardo: operar Mercado Pago e Stripe ao mesmo tempo e escolher, no superadministrador, o provedor de **cartão, Pix e boleto separadamente** para **novas** contratações. Assinaturas e cobranças que já existem ficam no provedor em que nasceram. Este documento é o resultado da Fase A (inspeção); nada foi implementado ainda.

## 1. O que já existe (conferido no código e nas migrações até a 0034)

**Cartão (assinatura recorrente, Mercado Pago)**
- `createSubscription` cria a assinatura sem plano (`POST /preapproval`, `status: pending`) e devolve o link do checkout hospedado. Referência = id da assinatura aqui dentro (`external_reference`).
- Tabelas: `billing_subscriptions` (provider_id único, provider_status `pending/authorized/paused/cancelled`, `access_until`, `scheduled_plan_id`), `billing_invoices`, `billing_invoice_payment_links`, `billing_payment_attempts`.
- Conciliação: `reconcileSubscription`, `reconcileAuthorizedInvoice`, `reconcilePayment`, `reconcileBillingAccess` (exige exatamente uma assinatura `authorized` ligada ao plano do estabelecimento), `refreshPendingSubscriptions`, `applyCancelledExpiry`.
- Troca de plano (`change-plan.ts`) e cancelamento (`cancel-subscription.ts`) chamam a API da Mercado Pago direto (`PUT /preapproval/{id}`).

**Pix e boleto (cobrança avulsa de um mês, Mercado Pago)**
- `billing_charges` (`method` pix|boleto, `provider_payment_id` único, uma aberta por estabelecimento), `billing_renewal_notices`, `tenants.paid_until`; referência `charge:<id>`; `charges.ts` (cria e concilia) e `charge-cycle.ts` (vencimento, carência, avisos).

**Avisos e ciclo**
- `POST /api/webhooks/mercado-pago` valida a assinatura (`x-signature`) e grava só o sinal em `billing_webhook_events` (`request_id` PK, `topic` com check de 3 valores). `processPaymentEvents` consulta o recurso na API e aplica de forma idempotente.
- `runBillingCycle` (a cada 10 minutos, `instrumentation.ts`) só liga com `liveBillingEnabled()`, que é **específico da Mercado Pago** (`MERCADO_PAGO_LIVE_MODE`).

**Painel**
- Plataforma (`/admin`), aba Gerenciar com categorias; `requireSuperAdminSession()` em cada página; ações em `src/app/admin/actions.ts` (padrão `run` + `PlatformError`); auditoria em `audit_log` (`actorUserId`, `tenantId` nulo para ações globais, `details` jsonb), como em `updatePlan`.
- Dono: `/painel/configuracoes/assinatura` (cartão, Pix, boleto, troca de plano, cancelamento).

**Não existe:** coluna de provedor em nenhuma tabela de cobrança, configuração global de provedor, SDK ou código da Stripe, nem qualquer variável `STRIPE_*`.

## 2. Pontos presos à Mercado Pago (onde mexer)
`create-subscription.ts`, `change-plan.ts`, `cancel-subscription.ts`, `charges.ts`, `mercado-pago-client.ts`, `sandbox.ts`, `mode.ts`, `refresh-pending.ts`, `webhook.ts` e a rota `api/webhooks/mercado-pago`, `process-events.ts`, `cycle.ts`/`instrumentation.ts` (liga só com a Mercado Pago) e a tela de assinatura. O que é regra da Agenda (acesso, carência, `paid_until`, bloqueio manual, `reconcile-access`) não muda.

## 3. Desenho proposto

**Banco (migração 0035, só aditiva; padrão `mercadopago` em tudo o que já existe)**
- `payment_gateway_settings(method pk in card|pix|boleto, provider, updated_at, updated_by)`, com as três linhas inseridas como `mercadopago`.
- `provider` (`mercadopago`|`stripe`, padrão `mercadopago`) em `billing_subscriptions`, `billing_charges` e `billing_webhook_events`; `billing_subscriptions.provider_customer_id`; índice único (provider, request_id) nos avisos. Faturas e pagamentos herdam o provedor da assinatura.
- RLS e grants como nas tabelas atuais; a tabela de configuração é global (sem `tenant_id`), só a conexão da plataforma lê e grava.

**Código (módulos no backend atual, sem serviço novo)**
- `src/server/billing/gateways/`: `types.ts` (capacidades por modalidade: `cardSubscription`, `pixCharge`, `boletoCharge`; nada de método falso), `mercadopago.ts` (adaptador fino que **chama o código atual**, sem reescrevê-lo), `stripe.ts`, `registry.ts`, `router.ts` e `readiness.ts` (status por provedor: configurado, faltam credenciais, indisponível).
- `router.resolve(method)` lê a configuração **do banco** no momento de criar o checkout e grava o provedor no registro novo. Troca de plano, cancelamento e consulta usam o `provider` gravado na assinatura, nunca o padrão.
- Checkout já aberto não muda: o roteador só é consultado ao criar (depois da checagem de "já existe assinatura ou tentativa em aberto", que continua valendo entre provedores).

**Tela do superadmin** (`/admin/pagamentos`, linha nova em Gerenciar): um controle por modalidade, com status de cada provedor, opção desabilitada com o motivo quando faltam credenciais, aviso fixo de que vale só para novas contratações, botão Salvar e confirmação só depois de gravar. O servidor revalida papel, modalidade, provedor e prontidão; grava `payment_gateway.changed` (de/para, quem, quando) em `audit_log`. Stripe só aparece para cartão. Pix e boleto só oferecem Mercado Pago até haver outro provedor homologado.

**Stripe (cartão, Checkout + Billing)**
- `POST /v1/checkout/sessions` em modo assinatura, criado no servidor, com **`price_data` inline** (valor do plano vem do nosso banco a cada sessão; nenhum Price ID vira fonte de verdade nem precisa ser mantido quando o preço mudar), `client_reference_id` e `metadata`/`subscription_data.metadata` com o id interno da assinatura e do estabelecimento, `Idempotency-Key` = id interno, URLs de retorno fixas no servidor. O retorno do checkout nunca libera o plano.
- Aviso em `POST /api/webhooks/stripe`: corpo bruto, assinatura `Stripe-Signature` verificada com `STRIPE_WEBHOOK_SECRET`, grava só (provider, id do evento) e o processador consulta o objeto oficial na API antes de aplicar. Eventos: `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `charge.refunded`, `charge.dispute.created` (nomes e campos a conferir na versão de API que for fixada).
- Estados da Stripe viram os mesmos estados internos (`active/trialing`→`authorized`, `incomplete`→`pending`, `canceled/incomplete_expired/unpaid`→`cancelled`; falha de renovação vira fatura recusada e entra na carência de sempre). Reembolso e contestação não mexem no acesso: vão para revisão em `/admin/cobranca`.
- Cancelar: no fim do período (`cancel_at_period_end`), mantendo `access_until`. Trocar de plano: `subscriptions.update` sem cobrança proporcional, igual à regra de hoje (aumento vale já, valor novo na próxima cobrança; redução no próximo ciclo). Atualizar cartão: Customer Portal.

## 4. Credenciais e passos que dependem de você
Nada disso bloqueia as Fases B (base e roteamento) e o código da Stripe; bloqueia só o teste real.
1. **Conta Stripe Brasil** (pessoa física aceita, CNPJ opcional): CPF do representante, conta corrente no mesmo CPF (Nubank é aceito), verificação de identidade e a informação de capacidade financeira exigida em 2026. Confirmar no cadastro real que Billing, Checkout e cartões ficaram habilitados.
2. Chaves: `STRIPE_SECRET_KEY` (`sk_test_…` e depois `sk_live_…`) e `STRIPE_WEBHOOK_SECRET` (`whsec_…`), colocadas só nas variáveis do Easypanel; mais `STRIPE_LIVE_MODE=true|false` (mesma ideia do modo real da Mercado Pago, separando teste e produção).
3. Endpoint de webhook a cadastrar na Stripe: `https://agenda.eneven.com.br/api/webhooks/stripe` (eventos acima). Portal do cliente configurado no painel da Stripe.
4. Antes de aplicar a migração em produção: backup do banco `agenda-db`.

## 5. Fases
- **B** base: migração 0035, adaptador Mercado Pago sem regressão, configuração, roteador, tela do superadmin e auditoria. Padrão continua Mercado Pago em tudo.
- **C** Stripe: cliente, checkout, webhook, conciliação, cancelamento, troca de plano, tela do dono. Opção só liberada para escolha quando a prontidão (chaves e webhook) estiver ok.
- **D** validação: testes da seção 11 da especificação; teste real com chaves de teste e depois um pagamento real de valor mínimo; troca do padrão só por decisão sua.

## 6. Testes (o que dá para provar sem a Stripe de verdade)
Unidade e PGlite: roteamento por modalidade, persistência e auditoria, acesso só do superadmin, assinaturas antigas seguem no provedor gravado, idempotência de duplo clique e de aviso repetido, avisos fora de ordem. Stripe com cliente injetado (sem rede) e assinatura de webhook calculada localmente com um segredo de teste. PostgreSQL real no CI para as consultas novas. **Só com conta e chaves reais:** checkout de verdade, 3DS, renovação, falha de cartão, reembolso e contestação.

## 7. Riscos
- `liveBillingEnabled()` e o relógio da cobrança só ligam com a Mercado Pago real: precisam ligar com qualquer provedor pronto, sem mudar o comportamento atual.
- `reconcile-access` assume uma assinatura autorizada: o mapeamento de estados da Stripe precisa respeitar isso.
- A migração roda sozinha quando o contêiner sobe: backup antes, e a 0035 só pode ser aditiva.
- Aceitação melhor na Stripe **não está provada**; medir tentativas, aprovações e motivos por provedor antes de decidir.
