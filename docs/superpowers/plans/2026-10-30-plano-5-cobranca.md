# Plano 5 — base da cobrança

## Comportamento

- A assinatura deve permitir contratação e troca de plano pelo dono, com histórico de faturas. Atraso gera aviso e uma carência de sete dias antes de impedir novos agendamentos; pagamento confirmado reativa o acesso. A troca de plano não deve desativar profissionais existentes: quando houver excedente, bloquear novas ativações até o total ficar abaixo do limite.
- Cartão recorrente e Pix mensal precisam ser tratados conforme as modalidades que estiverem disponíveis para a conta. Não presumir que um fluxo Pix manual se comporte como uma assinatura de cartão.
- Webhooks devem validar a assinatura, guardar um identificador para deduplicação e consultar a API do Mercado Pago para obter o estado confiável antes de alterar o acesso. Eventos repetidos ou fora de ordem não podem reverter um pagamento mais recente.
- Falhas no provedor, notificações repetidas, concorrência, mudança de plano, cancelamento e pagamentos atrasados exigem testes em banco real. Não usar credenciais reais nos testes ou registrar segredos.

## Referências oficiais

- [API de assinaturas](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/overview)
- [Webhooks de assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks)
- [Visão geral de assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview)

## Antes de ativar

Conferir o fluxo Pix da conta e os estados reais do provedor no ambiente de testes. Preparar migrações e rollback, configurar credenciais e webhook em ambiente seguro, executar testes e revisar a integração antes de ativar cobrança ou alterar estados em produção.
