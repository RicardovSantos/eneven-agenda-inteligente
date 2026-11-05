# Pagamentos com vários provedores (Mercado Pago + Stripe)

- O provedor padrão de cada forma (cartão, Pix, boleto) fica no banco (`payment_gateway_settings`) e só o superadmin muda, em **Gerenciar → Pagamentos** (auditado como `payment_gateway.changed`).
- Vale só para **novas** contratações e cobranças. Assinaturas e cobranças existentes seguem no provedor em que nasceram (coluna `provider`), inclusive renovações, cancelamento e troca de plano.
- Padrão de tudo: Mercado Pago. A Stripe faz cartão (assinatura) e Pix/boleto (cobrança avulsa de um mês, como no Mercado Pago) e só aparece como opção com as credenciais válidas. Pix e boleto da Stripe só valem com a Stripe em **modo real** (`STRIPE_LIVE_MODE=true`), porque o pagamento libera o mês de acesso.
- Os dois webhooks ficam sempre ativos: `/api/webhooks/mercado-pago` e `/api/webhooks/stripe`.

## Variáveis (Easypanel)
| Variável | Para quê |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` (teste) ou `sk_live_…` (real) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` do endpoint cadastrado |
| `STRIPE_LIVE_MODE` | `true` só em produção com chave real |

Nunca versionar chaves.

## Stripe: configuração no painel deles
1. Webhook `https://agenda.eneven.com.br/api/webhooks/stripe` com os eventos: `checkout.session.completed`, `checkout.session.expired`, `customer.subscription.created|updated|deleted`, `invoice.finalized`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.marked_uncollectible`, `invoice.voided`, `charge.refunded`, `charge.dispute.created`, `payment_intent.succeeded`, `payment_intent.processing`, `payment_intent.payment_failed`, `payment_intent.canceled` (estes quatro para Pix e boleto; acrescentar no destino já cadastrado).
   Ative também Pix e boleto em Configurações → Métodos de pagamento da Stripe. O Pix da Stripe vale 1 dia; o boleto, 10.
2. Customer Portal ativado (atualizar cartão, ver faturas).
3. Testar primeiro com chaves de teste (cartão 4242 4242 4242 4242).

## Deploy
1. Backup do banco `agenda-db` antes (a migração `0035_gateways_base` roda sozinha ao subir o contêiner; é só aditiva).
2. Subir o código. Nada muda para quem já assina: o padrão continua Mercado Pago.
3. Só depois configurar as variáveis da Stripe e, se quiser, trocar o cartão para Stripe em Pagamentos.

## Reverter
Em Pagamentos, voltar o cartão para Mercado Pago. Assinaturas já criadas na Stripe continuam sendo cobradas e conciliadas por ela (o webhook segue ativo).
