# Plano 5 — ponto de partida

**Teste adiado a pedido de Ricardo:** validar a criação e recuperação de assinatura com o sandbox real do Mercado Pago, incluindo assinatura em outros estados, antes de ativar cobrança. A recuperação em teste passou nos testes locais e no PostgreSQL 17 (CI do commit `7c61421`); ainda não houve teste com o provedor real.

Atualizado em 30/10/2026. Leia este arquivo antes de continuar. Branch `plano-5`, [PR #6 em rascunho](https://github.com/RicardovSantos/eneven-agenda-inteligente/pull/6). Último commit de código enviado nesta atualização: `8586837`. Confirme `git status` e o commit mais recente antes de trabalhar. O Plano 5 não foi integrado à `main` nem implantado.

Em 30/10/2026, o Plano 4 foi implantado na produção a partir do merge `a84a5a5`. O Easypanel reportou backup do banco `agenda-db` como `ok` antes do deploy; o objeto do backup não foi verificado independentemente. O serviço iniciou com migrações aplicadas e contêiner saudável; `/api/health` e `/api/health/db` retornaram 200.

As credenciais da Meta e o segredo do cron não estavam configurados no serviço. Portanto, o deploy não comprova o funcionamento do envio automático. Permanecem a revisão final e os testes completos do fluxo WhatsApp descritos em `2026-10-29-plano-4-pendencias.md`.

A branch `plano-5` parte da `main` após o deploy. A limitação de profissionais ativos foi iniciada em `src/server/catalog/professionals.ts`, com trava para criação/reativação simultânea e alterações de plano. O PostgreSQL 17 passou no CI do commit `8cd12a8`, incluindo testes de concorrência de pagamentos. Os testes direcionados, lint e typecheck da etapa `8586837` passaram localmente; a execução completa do CI desse commit estava pendente nesta atualização. Conferir o resultado do último commit, pois envios novos cancelam execuções anteriores.

As decisões e referências oficiais estão em `2026-10-30-plano-5-cobranca.md`. Há validação de assinatura, fila persistente de sinais, cliente de consulta ao provedor e rota bloqueada em produção. A carência de sete dias já é calculada a partir de `past_due_at`, mas ainda não há processo de cobrança que alimente esse campo. Existem tabelas isoladas de assinaturas e faturas e uma tela de consulta para o dono. A criação de assinatura pendente é restrita a credenciais de teste, sem botão público; a recuperação manual de assinaturas pendentes está em `/admin/cobranca`, apenas em testes e protegida para superadministrador. Contratar e trocar de plano ainda não estão disponíveis.

Faltam: validar as migrações 0013–0019 e os testes PostgreSQL no CI do último commit; concluir criação e gerenciamento de assinaturas e faturas; implementar o tópico de faturas e corrigir a associação entre pagamentos recorrentes e faturas, pois a referência externa da assinatura pode não ser o UUID da fatura local; revisar a idempotência e correspondência de conta, estabelecimento e valor antes de alterar acesso; tratar atraso, pagamento, cancelamento e reativação; enviar avisos; implementar contratação, troca de plano, Pix e testes ponta a ponta. O processador de pagamentos e assinaturas e o registro de múltiplas tentativas existem; o endpoint de acionamento só funciona fora de produção e não altera o acesso. Conferir reembolsos, compatibilidade de assinatura e reentregas no ambiente de testes do Mercado Pago. Não liberar a rota nem a cobrança até completar e revisar essas etapas. Os modelos, credenciais e agendador do WhatsApp também continuam pendentes em produção.

## Próxima sequência

1. Conferir o CI atual, corrigir falhas relevantes e revisar os limites de profissionais, inclusive concorrência com alterações de plano e downgrade.
2. Implementar criação e gerenciamento de assinaturas e faturas no Mercado Pago, com referências internas seguras, autorização do dono e tratamento de repetição e falhas.
3. Processar eventos de assinatura e fatura, conciliar pagamentos, reembolsos e múltiplas tentativas; validar identidade da conta, referência, valor, moeda e ambiente antes de qualquer efeito. A fila de pagamentos já existe, mas não libera acesso por si só.
4. Atualizar acesso por pagamento confirmado, atraso e carência, sem desfazer bloqueios administrativos; implementar avisos e reativação. Testar eventos repetidos, fora de ordem, simultâneos e de outros estabelecimentos.
5. Concluir contratação, troca de plano e Pix mensal conforme possibilidades verificadas na conta; testar em ambiente do provedor e no navegador. Executar os testes demorados ao final, conforme pedido do Ricardo.
6. Revisar segurança, migrações, backup e resultado do CI antes de propor ativação de webhook, cron e cobrança em produção. As rotas de webhook e cron de cobrança retornam 503 em produção no estado atual.
