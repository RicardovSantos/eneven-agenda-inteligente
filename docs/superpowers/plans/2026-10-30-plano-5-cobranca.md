# Plano 5 — base da cobrança

## Comportamento

- A assinatura deve permitir contratação e troca de plano pelo dono, com histórico de faturas. Atraso gera aviso e uma carência de sete dias antes de impedir novos agendamentos; pagamento confirmado reativa o acesso. A troca de plano não deve desativar profissionais existentes: quando houver excedente, bloquear novas ativações até o total ficar abaixo do limite.
- A carência usa `tenants.past_due_at` e só funciona quando um processo confiável registrar o início do atraso. Sem essa data o estabelecimento em `past_due` permanece bloqueado. Ainda faltam a gravação desse estado pelo processador e os avisos por e-mail.
- Cartão recorrente e Pix mensal precisam ser tratados conforme as modalidades que estiverem disponíveis para a conta. Não presumir que um fluxo Pix manual se comporte como uma assinatura de cartão.
- `createTestSubscription` reserva uma tentativa antes da chamada e impede novas tentativas se o resultado for incerto; só aceita credencial de teste e não funciona em produção. O chamador futuro precisa verificar o dono e usar endereço de retorno definido no servidor. Em `/admin/cobranca`, disponível somente fora de produção e para superadministrador, é possível recuperar pelo ID do provedor após validar referência, vendedor, valor e link. A recuperação registra auditoria e só aceita assinaturas pendentes. Uma busca sem resultado não libera nova criação automaticamente: o operador pode confirmar manualmente a ausência no provedor, com auditoria, para liberar nova tentativa. A operação não cancela assinatura remota. Faltam recuperação de outros estados e validação em sandbox real.
- Webhooks devem validar a assinatura, guardar um identificador para deduplicação e consultar a API do Mercado Pago para obter o estado confiável antes de alterar o acesso. Eventos repetidos ou fora de ordem não podem reverter um pagamento mais recente.
- Há validação de assinatura e registro persistente em `billing_webhook_events`. A rota permanece bloqueada em produção enquanto não houver processador. O identificador da requisição evita inserção repetida do mesmo pedido, mas não substitui a idempotência do processamento de pagamentos. A janela de cinco minutos deve ser confrontada com o comportamento de reentregas em testes reais do Mercado Pago antes de uso em produção. O corpo não é autenticado por esse HMAC: não usar seus campos como prova de pagamento.
- `src/server/billing/mercado-pago-client.ts` consulta recursos específicos do provedor e valida o identificador retornado. A conciliação só pode alterar acesso em ambiente de teste e com credenciais de teste.
- `src/server/billing/verify-payment.ts` compara o pagamento consultado com a referência interna, vendedor, ambiente, moeda e valor esperados. Esses valores devem vir de uma fatura criada e vinculada pela plataforma; o validador ainda não aplica mudanças e não substitui as verificações de status, ordem e idempotência.
- `reconcilePayment` consulta o pagamento e atualiza uma fatura vinculada quando os dados conferem; usa bloqueio de linha, ignora versões antigas e rejeita versões conflitantes no mesmo horário. As tentativas têm registro separado; uma aprovada prevalece sobre outra recusada, mas estornos ou contestações em qualquer tentativa exigem revisão antes de alterar acesso. `processPaymentEvents` processa sinais de pagamento, assinatura e fatura e adia falhas para nova tentativa. A rota protegida `POST /api/cron/cobranca` funciona somente fora de produção; com credencial `TEST-` processa acesso e vencimentos em teste. Validar agregação, reembolsos e reentregas no provedor antes de usar em produção.
- `reconcileAuthorizedInvoice` associa a fatura recorrente pela assinatura previamente vinculada, valida vendedor, referência, moeda e valor e registra o ID do pagamento retornado. Só a consulta individual do pagamento pode atualizar seu status. A consulta de pagamento aceita referência da assinatura apenas com esse vínculo confirmado. Confirmar os formatos reais, reentregas e tentativas em sandbox antes de usar o fluxo em produção.
- Falhas no provedor, notificações repetidas, concorrência, mudança de plano, cancelamento e pagamentos atrasados exigem testes em banco real. Não usar credenciais reais nos testes ou registrar segredos.

## Referências oficiais

- [API de assinaturas](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/overview)
- [Webhooks de assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks)
- [Visão geral de assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview)

## Antes de ativar

Conferir o fluxo Pix da conta e os estados reais do provedor no ambiente de testes. Preparar migrações e rollback, configurar credenciais e webhook em ambiente seguro, executar testes e revisar a integração antes de ativar cobrança ou alterar estados em produção.
