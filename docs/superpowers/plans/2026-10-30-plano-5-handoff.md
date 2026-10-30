# Plano 5 — ponto de partida

Em 30/10/2026, o Plano 4 foi implantado na produção a partir do merge `a84a5a5`. O Easypanel reportou backup do banco `agenda-db` como `ok` antes do deploy; o objeto do backup não foi verificado independentemente. O serviço iniciou com migrações aplicadas e contêiner saudável; `/api/health` e `/api/health/db` retornaram 200.

As credenciais da Meta e o segredo do cron não estavam configurados no serviço. Portanto, o deploy não comprova o funcionamento do envio automático. Permanecem a revisão final e os testes completos do fluxo WhatsApp descritos em `2026-10-29-plano-4-pendencias.md`.

A branch `plano-5` parte da `main` após o deploy. A próxima etapa definida na especificação é cobrança por Mercado Pago, limite de profissionais e carência de 7 dias. A limitação de profissionais ativos foi iniciada em `src/server/catalog/professionals.ts`, com trava para criação/reativação simultânea. Os testes de catálogo e typecheck passaram; conferir o teste PostgreSQL concorrente no CI. Revisar ainda a concorrência com alteração administrativa de plano/limite e o comportamento de downgrade antes de concluir a tarefa.

Ainda não há plano detalhado nem implementação de cobrança. Antes de codificar a integração de pagamento, verificar documentação oficial atual e definir testes de webhook, idempotência e isolamento.
