# Pendências e decisões do Plano 3 (Clientes, painel e plataforma)

Registro das decisões tomadas pelo controlador durante a execução e dos itens menores deixados para os próximos planos.

## Decisões (rulings)
- Ruling R1: `src/server/platform/plans.ts` é criado na T1 (`DEFAULT_PLAN_CODE`, `getDefaultPlanId`) e a T8 acrescenta `listPlans`/`updatePlan` no mesmo arquivo. — evita dois módulos de planos — custo: nenhum.
- Ruling R2: erros próprios por módulo: `src/server/clients/errors.ts` (`ClientError`, códigos `not_found|phone_taken|forbidden|validation`) e `src/server/team/errors.ts` (`TeamError`); `src/server/agenda/errors.ts` não muda na T2. — módulos independentes — custo: dois arquivos pequenos.
- Ruling R3: `navItemsFor` (pura, importável no cliente) fica em `src/lib/panel-nav.ts`; `requirePanelRole` fica em `src/server/panel/roles.ts`. — componente cliente não pode importar módulo de servidor — custo: nenhum.
- Ruling R4: cada tarefa que precisa de semente nova para o e2e acrescenta a ação na rota de apoio `/api/e2e/seed` (mesmas travas: `E2E_SEED`, `NODE_ENV` diferente de production, segredo com comparação segura) com teste em `tests/public/e2e-seed.test.ts`. — e2e precisa de dados — custo: rota cresce.
- Ruling R5: nas T3/T5/T7/T9 o implementer roda só o spec novo (`pnpm test:e2e tests/e2e/<novo>.spec.ts`); a suíte completa estável é responsabilidade da T10. — P16 do Plano 2 — custo: regressão e2e cruzada só aparece na T10.
- Ruling R6: profissional (staff) vê e-mail e observações do cliente que atendeu — observação (ex.: alergia) é útil para quem atende; o spec só tira faturamento — custo: profissional vê o e-mail do cliente.
- Ruling R7: na T3, "rate limit de escrita igual ao das ações do painel" — as ações do painel não têm rate limit; as ações de clientes seguem o mesmo padrão (sem limite, autenticadas e por estabelecimento). — o plano pressupôs algo inexistente — custo: um usuário logado pode disparar muitas escritas (já anotado no Plano 2).
- Ruling R8: profissional vê o preço de cada atendimento próprio no histórico do cliente; só "Total gasto" fica oculto. — preço do próprio atendimento não é faturamento geral (§5) — custo: profissional vê valores dos atendimentos dele.
- Ruling R9: o aviso de pendentes não diz "de dias anteriores" (a lista inclui atendimentos que terminaram hoje): texto "N atendimentos que já terminaram estão sem resultado." — fiel ao dado — custo: difere do mockup.
- Ruling R10: tabela "Por profissional" também no celular (o mockup omitia) e blocos em 2 colunas de 1024 a 1279 px — informação útil ao dono, layout responsivo — custo: tela do celular mais longa.
- Ruling R11: a guarda estática aceita `requirePanelRole(` como equivalente a `requireOnboarded(` (`requirePanelRole` chama `requireOnboarded`) — custo: nenhum, desde que a chamada interna exista.
- Ruling R12: Google + convite: a T6 entrega no servidor `acceptInvitation(db, token, { googleProfile })` (cria usuário verificado sem senha + `oauth_accounts` + vínculo, ou usa o existente quando o e-mail/sub já tem conta) e a T7 liga o cookie do convite e a rota de retorno do Google. — mantém a T6 testável sem rotas — custo: o fluxo Google completo só ficou de pé na T7.
- Ruling R13: funções públicas de convite NÃO devolvem o token (`inviteMember`/`resendInvitation`/`createOwnerAccessInvite` enviam o e-mail e devolvem `{ invitationId, emailSent }`); só um emissor interno (testes e semente do e2e) recebe o token. — quem convida não pode aceitar no lugar do convidado e "confirmar" e-mail alheio (pré-sequestro) — custo: interface difere do plano; o e2e usa semente própria.
- Ruling R14: convite de dono dura 7 dias e, ao aceitar, define a senha (funciona como uma redefinição longa) — o link vai só ao e-mail do dono criado pelo Ricardo — custo: link vazado vale 7 dias. Aceite de dono não exige nome.
- Ruling R15: `/entrar` entra na regra de cabeçalho `no-referrer` + `noindex`, porque o token do convite aparece em `/entrar?convite=` — custo: nenhum (a página de login não precisa de referrer nem de indexação).
- Ruling R16: métricas da plataforma — `bookings30d` = não cancelados com início nos últimos 30 dias; "Em teste" = testes ainda no prazo; as contagens das abas respeitam a busca mas não o filtro de situação; o modo suporte não tem prazo próprio (acaba ao voltar à plataforma ou sair; a sessão segue os 30 dias normais). — escolhas razoáveis — custo: o Ricardo pode ficar no modo suporte se esquecer de voltar.
- Ruling R17: desvios aceitos da T9 — pílula "Teste vencido", "Desde dd/mm" no lugar de "Renova em" (sem dado de renovação até o Plano 5), cartões no celular, histórico com entrada e saída do suporte em linhas separadas, troca de plano aplicada na hora, faixa de somente leitura no fluxo. — dados reais disponíveis — custo: pequenas diferenças do mockup.
- T10: a suíte e2e entra no CI (job `e2e`) com o mesmo servidor de desenvolvimento e PGlite próprio; as specs de captura de tela ficam excluídas da suíte padrão. Fecha a pendência P16 do Plano 2 quando a estabilidade for confirmada.

## Pendências conhecidas (próximos planos)
- Plano 4: uso da franquia de lembretes na visão geral; mensagens e custo de WhatsApp nas métricas da plataforma.
- Plano 5: limite de profissionais por plano (hoje não é cobrado) e carência de 7 dias do pagamento atrasado.
- Escolha de estabelecimento para quem tem vínculo com mais de um: o convite recusa esse caso por enquanto.

## Pendências menores
- Task 1: minor (deferred): o snapshot 0004 mostra `plan_id` NOT NULL e o SQL deixa nulo (documentado); asserts de falha só `.not.toBeNull()` (sem código 23502/23503/23514) em `plano3-schema.test.ts`; caminho de migração com estabelecimento existente só testado no PGlite; ordem de import em `login.test.ts`
- Task 2: minor (deferred): regex de UUID copiado 3x (`panel-ops`, `clients/queries`, `clients/mutations`); trim/slice repetido em `searchCustomers` e `customerMatch`
- Task 2: minor (deferred): sem teste de barra invertida literal na busca; o teste de corrida só prova o desfecho (mutação manual relatada)
- Task 3: minor (deferred): `revalidatePath` não cobre `/painel/clientes/[id]` (o cliente usa `router.refresh`)
- Task 3: minor (deferred): `listClients` sem teto próprio para `pages` (o teto vem de `parseClientsQuery`, 40)
- Task 4: minor (deferred): `next30` soma 30×24 h (difere de 30 dias locais só com horário de verão); casts `::int` de centavos (estoura acima de 21 milhões de reais no mês)
- Task 4: minor (deferred): desempate por id em `pending` sem teste; constante `DAY` local em `pending.test.ts`
- Task 5: minor (deferred): `day-bars.tsx` com ~300 linhas; `role="img"` focável (alternativa `role="group"`); refresh que falha deixa itens velhos no "Revisar"
- Task 5: minor (deferred): o ajuste do tooltip usa altura fixa de 36 px
- Task 6: minor (deferred): implementação nomeada `...ForTests` e a pública a embrulha (nome invertido; a T7 acrescentou teste estático que proíbe importar `...ForTests` fora de `tests/` e da semente do e2e); filtro de dono ainda existe só como type guard; `credentials.name=""` no aceite de dono
- Task 7: minor (deferred): "Cancelar convite" sem confirmação; spinner só no "Reenviar"; filtro de `professionalIdsWithAccess` em JS; descarte silencioso da senha de conta não verificada ao entrar com convite (política da T6); asserção fraca no teste de Google não verificado
- Task 7: minor (deferred): o detector não pega `import X, { yForTests }` nem `import()` dinâmico
- Task 8: minor (deferred): aceitar convite durante o suporte deixa a sessão antiga (padrão existente); `guard.ts` não precisou mudar (`canAccessTenantPanel` já exige papel)
- Task 8: minor (deferred): leitura da sessão no `startSupport` sem `FOR UPDATE` (corrida da mesma sessão)
- Task 9: minor (deferred): CSS global com `:has()` e seletores por substring de classe para a faixa de suporte (frágil); `Intl.NumberFormat` repetido em 3 componentes
- Task 9: minor (deferred): o assistente no suporte não avisa dono não verificado; auditoria do envio de acesso fora de transação, depois do e-mail; estabelecimento sem dono no suporte cai no e-mail do super-admin

## A conferir após o deploy
- Backup do banco antes do deploy.
- Antes do deploy: nenhum estabelecimento em produção usa o slug `convite` (a rota `/convite/{token}` passa a existir).
- `__drizzle_migrations` com as migrações `0004` e `0005` aplicadas; `plan_id` preenchido em todos os estabelecimentos (a `0005` põe todos no Essencial).
- Promover a conta do Ricardo: `node dist/create-super-admin.mjs --promote <e-mail dele>` pelo console do serviço.
- `/admin`: lista de estabelecimentos e métricas.
- "Entrar como o estabelecimento" e "Voltar à plataforma" (faixa de suporte e histórico).
- No painel do Ricardo: Clientes e Visão geral com os dados dele.
