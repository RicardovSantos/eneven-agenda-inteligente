# Pix e boleto para o plano da Eneven (desenho)

Data: 04/11/2026. Decisão do Ricardo: o dono paga o plano por Pix, com um QR code novo a cada mês e aviso antes do vencimento. Em 04/11 o boleto entrou no mesmo desenho: ele é outra forma de pagamento avulso, com o mesmo ciclo.

## Por que não dá para reaproveitar a assinatura de cartão

- A Mercado Pago não renova Pix sozinha: cada mês é um pagamento novo, com QR code próprio.
- Toda a conciliação de acesso (`reconcile-access.ts`) exige **exatamente uma assinatura autorizada** e faturas ligadas a ela. Para um dono que paga só por Pix, isso devolve "review" e trava o processamento dos avisos (`process-events.ts` lança "Acesso requer revisão").
- `reconcile-payment.ts` só aceita pagamento cuja `external_reference` é uma fatura ou assinatura (UUID).

Por isso o Pix entra como um **caminho paralelo e aditivo**: não muda o que já cobra cartão.

## Modelo

Tabela nova `billing_charges` (uma linha por QR code ou boleto gerado; `method` = `pix` ou `boleto`):

| Campo | Uso |
|---|---|
| id, tenant_id, plan_id | identificação; RLS por estabelecimento |
| amount_cents | valor do plano no momento (nunca vem do navegador) |
| provider_payment_id (único) | id do pagamento na Mercado Pago |
| status | pending, approved, expired, cancelled, refunded |
| method | `pix` ou `boleto` |
| qr_code, qr_code_base64 | Pix: "copia e cola" e imagem do QR |
| ticket_url, barcode | boleto: link do PDF e linha digitável |
| expires_at | validade do QR (a Mercado Pago aceita até 30 dias) |
| paid_at, period_start, period_end | mês de acesso que este pagamento compra |

Acesso: `tenants` ganha `paid_until` (timestamp, nulo para quem só usa cartão). Pagamento aprovado soma 1 mês a partir do maior entre "agora" e `paid_until`.

## Fluxo

1. Dono abre Configurações > Assinatura e escolhe **Pagar com Pix** (só quando não há assinatura de cartão ativa; os dois ao mesmo tempo é recusado).
2. Servidor cria o pagamento na Mercado Pago (`POST /v1/payments`, `payment_method_id: pix`, `external_reference: charge:<id da cobrança>`, chave de idempotência = id da cobrança, valor do plano atual). Mostra QR e "copia e cola", com atualização automática da tela quando paga.
3. A Mercado Pago avisa pelo webhook que já existe (`payment`). O processador de avisos **antes** de tentar a conciliação do cartão consulta o pagamento e, se a referência começa com `charge:`, concilia pelo caminho das cobranças avulsas: confere dono do pagamento (coletor, modo real, moeda, valor igual ao da cobrança), aplica `approved` uma única vez e soma o mês.
4. Aprovado: `paid_until` avança, o estabelecimento fica `active`, sem `past_due`.
5. Ciclo diário: quem tem `paid_until` e nenhuma assinatura de cartão ativa:
   - 5 dias antes do vencimento: gera a próxima cobrança Pix e avisa o dono (e-mail e WhatsApp), com o link para pagar;
   - vencido: `past_due` com a carência de 7 dias que já existe, e depois só leitura (regra atual).
6. Reembolso ou contestação de um Pix: não mexe no acesso sozinho; vai para revisão em `/admin/cobranca`, como já é para cartão.

## Segurança e dinheiro

- Valor, plano e estabelecimento sempre do servidor; o QR só é criado para o dono autenticado.
- Idempotência: a chave da Mercado Pago é o id da cobrança; um aviso repetido não soma o mês duas vezes (`approved` só aplica a partir de `pending`).
- Uma única cobrança `pending` por estabelecimento por vez.
- Só no modo real em produção (mesmo `liveBillingEnabled`); no teste, sandbox.
- Nada de dado de cartão ou chave Pix de terceiros guardado.

## Entregas (cada uma com testes e sem ligar a cobrança até a última)

1. Banco: `billing_pix_charges` + `tenants.paid_until`, políticas de acesso.
2. Servidor: criar cobrança Pix, conciliar pagamento Pix, desvio no processador de avisos.
3. Tela de Assinatura: botão "Pagar com Pix", QR, "copia e cola", status, histórico.
4. Ciclo: nova cobrança antes do vencimento, avisos por e-mail/WhatsApp, vencimento e carência.
5. Revisão em `/admin/cobranca` e teste ponta a ponta com um Pix real de valor mínimo (a conta da Mercado Pago permite).

## Perguntas em aberto

- Pagar vários meses de uma vez (3, 6, 12) com desconto? Fora do primeiro corte.
- Dono com cartão e Pix ao mesmo tempo: recusado no primeiro corte (para não duplicar cobrança).

## Boleto: o que muda em relação ao Pix

- **Dados do pagador:** a Mercado Pago exige CPF ou CNPJ, nome e endereço completo (CEP, rua, número, bairro, cidade, UF). O dono preenche uma vez, num formulário em Assinatura. Esses dados vão direto para a Mercado Pago e **não ficam guardados** aqui (LGPD); só ficam o método e o valor.
- **Prazo:** o boleto vence em até 29 dias, mas só confirma 1 a 3 dias úteis depois do pagamento. Por isso o app gera o boleto do mês seguinte **10 dias antes** do vencimento (o Pix, 5 dias), e o acesso só avança quando a Mercado Pago marca `approved`.
- **Vencimento do boleto:** `date_of_expiration` = vencimento do mês; boleto vencido e não pago vira `expired` e o ciclo gera outro, se ainda for necessário.
- **Custo:** a Mercado Pago cobra tarifa por boleto pago (maior que a do Pix). Isso sai do valor recebido, sem mudar o preço do plano.
- O restante (conciliação, idempotência, `paid_until`, avisos, revisão) é idêntico ao Pix.
