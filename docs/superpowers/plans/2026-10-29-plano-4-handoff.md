# Plano 4 — handoff para continuidade

## Atualização de 30/10/2026

- Alterações locais posteriores: prioridade de lembrete da véspera na fila, janela diária de cota consistente, histórico de mensagens no detalhe do agendamento, consumo de WhatsApp na lista da plataforma, indicador de limite diário e orientações no README. A correção de lint foi aplicada, mas deve ser confirmada por nova execução.
- O build e o lint passaram em versões anteriores às últimas mudanças. `test:pg` foi ignorado por falta de `TEST_DATABASE_URL`; não foi uma execução PostgreSQL. Os testes e verificações devem ser executados novamente sobre a versão final.
- Foram adicionados filtro de franquia esgotada e contagem de confirmação pelo WhatsApp com a migração 0012; ainda precisam de validação. Continuam pendentes os cenários e2e completos, revisão do conjunto e CI PostgreSQL. Confira a implementação completa contra o plano antes de marcar tarefas como concluídas.

Atualizado em 29/10/2026. Leia este arquivo primeiro, depois o plano completo `2026-10-29-plano-4-whatsapp.md` e as instruções de `AGENTS.md`. O trabalho está em andamento; não considere o Plano 4 concluído nem pronto para produção.

## Onde parou

- Repositório: `E:\VSCODE-PROJETOS\Eneven-Agenda-Inteligente`, branch `plano-4`, PR [#3, em rascunho](https://github.com/RicardovSantos/eneven-agenda-inteligente/pull/3). Último commit local e enviado registrado nesta sessão: `28a3050` (`feat(whatsapp): fila e configurações iniciais`). Confirme `git status`, histórico, remoto e CI antes de continuar.
- O Plano 3 foi integrado e implantado anteriormente; seu histórico e verificações ainda pendentes estão em `2026-10-27-plano-3-handoff.md`. Não há registro de deploy do Plano 4. Não faça merge ou deploy do Plano 4 sem autorização específica e sem as verificações necessárias.
- As tarefas 1–3 do plano estão marcadas como concluídas; as tarefas 4–8 estão abertas e têm implementação parcial. Revise os requisitos do plano: não marque caixas como concluídas apenas porque há código.
- Existem alterações **sem commit** importantes, feitas nesta sessão. Não as descarte, sobrescreva ou faça reset. Elas estão somente na pasta local, não no GitHub: para outro agente usá-las é preciso acessar esta mesma pasta ou transferir as alterações com segurança.

## Implementação já existente

- Os commits `59e6ee3` e `deb8be2` reforçam o webhook, a identificação de eventos e tokens adicionais de gerenciamento armazenados como hash. O PostgreSQL 17 no CI passou 19 testes naquele estágio.
- O commit `28a3050` introduz fila, scheduler, cotas, integração inicial com criação/remarcação/cancelamento, configuração de mensagens para o dono, resumo de consumo e métricas administrativas. Há endpoint protegido `POST /api/cron/whatsapp`. A entrega dessas funcionalidades ainda precisa ser comparada ao plano e revisada como conjunto.
- Na versão commitada, testes unitários passaram 42 testes em 12 arquivos e o e2e específico de configurações passou em 390 e 1280 px. Esses resultados não substituem a validação da versão atual.

## Alterações locais ainda não commitadas

- `drizzle/0010_cultured_millenium_guard.sql`, seu snapshot e o schema adicionam dados para recuperação de eventos recebidos: payload cifrado, instante de captura e tentativas. `src/server/whatsapp/event-crypto.ts` usa AES-256-GCM derivado de `SESSION_SECRET`; o payload é removido após conclusão. Rotação/perda desse segredo afeta a recuperação de eventos antigos e deve ser documentada.
- `drizzle/0011_orange_groot.sql`, seu snapshot e o schema vinculam mensagem à fila para revisão manual de envios incertos. Verificar a migração em PostgreSQL real, inclusive a chave estrangeira e `ON DELETE SET NULL` somente em `queue_id`.
- Webhook e fila têm recuperação manual de resultados incertos, com auditoria; a tela `/admin/whatsapp` e suas ações exigem superadministrador. A recuperação deve exigir que o operador confira o resultado no provedor antes de repetir: em falhas de rede não se pode garantir envio exatamente uma vez.
- `interactive-actions.ts` verifica o número do remetente contra o cliente do agendamento. Há alterações nos testes de webhook e fila e um novo teste de criptografia.
- Em `queue.ts`, uma consulta que passava `Date` bruto em SQL foi corrigida localmente com `lt(...)`; a correção ainda não foi enviada nem verificada no PostgreSQL 17 do GitHub.
- Para a lista exata de arquivos, use `git status --short` e `git diff`; inclua arquivos não rastreados na inspeção. Preserve também os snapshots e o journal das migrações.

## Validação e falhas conhecidas

- A execução GitHub Actions `40941827961` falhou no job `test-pg` do commit `28a3050` por interpolação de `Date` na consulta da fila. Há correção local acima, ainda sem resultado no CI. Confira também os demais jobs e os logs do commit novo após o próximo push.
- `pnpm typecheck` passou no estado local desta sessão. `pnpm lint` **falhou**: `src/app/admin/whatsapp/page.tsx:11` chama `Date.now()` durante renderização, violando `react-hooks/purity`. Corrigir e executar novamente.
- Testes locais de fila e webhook passaram 10/10 durante as alterações; anteriormente, o conjunto direcionado de WhatsApp/configurações/métricas passou 43 testes em 13 arquivos. O teste novo `event-crypto.test.ts` foi criado depois dessa execução: rode novamente e não atribua esses resultados ao estado final sem verificação.
- A suíte completa, build, e2e completo e PostgreSQL 17 **não foram validados no estado local atual**. Antes de concluir, rodar `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, os testes PostgreSQL e `pnpm test:e2e`; verificar os comandos e pré-requisitos no `package.json` e no CI.

## Próximos passos

1. Corrigir o lint, revisar as alterações locais e os requisitos de segurança; testar criptografia, recuperação e ações interativas. Examinar concorrência e comportamento de reprocessamento, evitando repetição automática de envio incerto.
2. Completar a tarefa 4 e conferir prioridade de lembrete da véspera, limites e concorrência; ampliar testes PostgreSQL para migrações e recuperação. Após correções, commitar e enviar a branch e acompanhar o job `test-pg` com PostgreSQL 17 até ficar verde.
3. Conferir integração de agendamentos e tratamento de falhas entre gravação do agendamento e inclusão na fila. Completar as tarefas 5–7, incluindo histórico de mensagens do agendamento, consumo por estabelecimento e demais métricas/interfaces exigidas no plano, quando ainda faltarem.
4. Completar testes e2e do fluxo inteiro, incluindo webhook e confirmação; rodar a regressão completa e acompanhar todos os jobs do PR. Documentar decisões, configuração de segredos e cron, recuperação manual e pendências reais no README e em `2026-10-29-plano-4-pendencias.md`.
5. Fazer revisão final de todo o Plano 4, corrigir e validar achados. Só depois apresentar resultados e solicitar autorização específica para merge/deploy, se ainda necessária. Não presumir configurações reais da Meta ou cron de produção.

## Cuidados preservados

- Preserve isolamento de dados por estabelecimento e RLS; operações globais da fila/webhook devem usar apenas o contexto privilegiado apropriado e ter acesso administrativo protegido.
- Não exponha códigos de convite a quem convida; mantenha os controles de acesso, auditoria e demais garantias do Plano 3 descritos no handoff correspondente.
- Não inclua segredos, tokens, payloads sensíveis ou dados pessoais nos logs, no handoff ou no PR. Confira o guia relevante em `node_modules/next/dist/docs/` antes de alterar código Next.js.
