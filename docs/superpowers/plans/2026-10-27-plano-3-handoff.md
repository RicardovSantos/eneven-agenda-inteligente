# Plano 3 — handoff para continuidade dos testes

**Continuidade do trabalho atual:** para o Plano 4 e suas alterações locais em andamento, leia primeiro [o handoff do Plano 4](2026-10-29-plano-4-handoff.md). O histórico abaixo permanece como referência do Plano 3.

Atualizado em 29/10/2026. Leia este arquivo primeiro. O Plano 3 já está na `main` e em produção; o objetivo agora é concluir as verificações abaixo e relatar os resultados ao Ricardo. Não repita merge, deploy, backup ou promoção sem motivo e autorização.

## Estado atual

- [PR #2](https://github.com/RicardovSantos/eneven-agenda-inteligente/pull/2) integrado à `main`; merge `149fe3110c3f9160662c403f6d0326e3de836a63`. Último commit da branch: `0a2c0e670a27081a07cc55a36da6d8971e7b0121`.
- Deploy manual concluído no Easypanel, projeto `eneven`, serviço `agenda-web`. O serviço foi inspecionado com o commit de merge acima; o novo contêiner estava saudável. Produção: https://agenda.eneven.com.br.
- `ricardovieirads2025@gmail.com` foi promovido a superadministrador pelo comando `node dist/create-super-admin.mjs --promote ...`; o serviço retornou confirmação. Ricardo confirmou esse e-mail antes da promoção.
- Antes do deploy, a consulta no banco retornou **0** estabelecimentos com slug `convite`. O Easypanel retornou `ok` para a execução do backup configurado de `agenda-db` no R2 Eneven, mas a existência do arquivo no armazenamento não foi confirmada independentemente.
- Logs após deploy: `Aplicando migrações...` e `Migrações aplicadas.` A consulta ao banco retornou **6 migrações registradas** e **0** estabelecimentos com `plan_id` nulo. Ainda não se conferiu individualmente o registro das migrações 0004 e 0005.
- Testes de fumaça públicos: `/api/health`, `/api/health/db`, `/entrar` e `/manifest.webmanifest` retornaram 200; `/painel` sem sessão retornou 307 para `/entrar`; slug inexistente retornou 404.
- CI do último commit do PR: `qualidade`, `test-pg` e `e2e` verdes. Localmente: lint, typecheck, 999 testes unitários, `build`, `build:admin` e e2e com 35 testes passaram. Antes da última correção, a suíte e2e passou três vezes seguidas. O e2e final e o CI também passaram após a correção.
- O job `e2e` está em `.github/workflows/ci.yml`; captura de traces em falha. Specs de captura ficam fora da suíte padrão e usam `playwright.capturas.config.ts`. README e arquivo de pendências foram commitados.
- Este handoff estava sem rastreamento no diretório local. Confira `git status` e preserve quaisquer alterações existentes antes de trabalhar. A cópia local pode estar na branch `plano-3`; confira a `main` remota antes de comparar ou alterar código.

## Próximos passos: testes em produção

1. **Validar o acesso real de Ricardo:** com a conta Google confirmada acima, acessar `/admin` e verificar lista e métricas. Não há registro nesta conversa de que isso tenha sido feito. Se precisar da sessão pessoal, peça ao Ricardo para entrar no navegador; não peça senha nem crie sessão artificial em produção.
2. **Validar suporte:** escolher um estabelecimento conhecido, abrir “Entrar como o estabelecimento”, conferir nome e faixa de suporte, e usar “Voltar à plataforma”. Conferir o histórico de entrada e saída. A ação altera a sessão e gera auditoria: use apenas o estabelecimento autorizado e evite outras alterações em dados reais.
3. **Validar o painel do próprio Ricardo:** abrir Clientes e Visão geral e conferir dados e acesso. Não crie clientes, convites ou agendamentos reais apenas para teste sem autorização específica.
4. **Confirmar backup no R2:** localizar o objeto recente da rotina `agenda-db` no bucket configurado `eneven-backups`, verificar data e tamanho e, se houver forma autorizada e segura, conferir integridade. Não restaure sobre produção. O `ok` recebido só confirma a operação acionada, não comprova o arquivo.
5. **Identificar migrações 0004 e 0005:** comparar os registros em `drizzle.__drizzle_migrations` com os hashes e a ordem das migrações do repositório, usando consulta somente de leitura. A contagem de seis e a mensagem genérica no log não identificam individualmente as versões. Confirmar também o preenchimento de `plan_id`; já se observou zero nulos.
6. **Revisão final completa:** revisar o conjunto do Plano 3 contra a base anterior `834f3a4b1f96c7a746d91cd52f265af3ff33a0e3`, por exemplo `git diff 834f3a4b1f96c7a746d91cd52f265af3ff33a0e3..0a2c0e670a27081a07cc55a36da6d8971e7b0121`. Não use `git diff main...plano-3` após o merge como substituto: pode estar vazio. A revisão anterior concentrou-se em segurança, acesso e migrações, não foi exaustiva. Relate achados com gravidade e arquivo/linha.
7. Se encontrar falha, reproduza de forma segura, corrija e valide em ambiente de teste; qualquer novo deploy em produção precisa de autorização de Ricardo e do fluxo de confirmação do conector. Não presuma que o backup anterior cobre alterações posteriores.

## Cuidados de segurança

- O token de convite nunca deve chegar ao convidante. `inviteMember`, `resendInvitation` e `createOwnerAccessInvite` retornam somente `{ invitationId, emailSent }`; emissores `...ForTests` ficam restritos a testes e seed e2e.
- Todo aceite aplica `limitAcceptInvite(ip)`, inclusive formulário, sessão, login com convite e retorno Google. O seed `/api/e2e/seed` exige segredo e permanece desligado em produção.
- Suporte depende de `is_super_admin` atualizado em cada leitura de sessão, altera somente a própria sessão e registra entrada/saída em auditoria. Todas as páginas e ações de `/admin` exigem superadministrador.
- Link público e aviso usam a verificação do dono também para equipe e suporte. A correção está no commit `0a2c0e6`; não permitir que membros reenviem confirmação em nome do dono.
- Em somente leitura, criação e remarcação de agendamento e criação de bloqueio devem ser recusadas; cancelamento e registro de resultado continuam permitidos.
- Atenção ao isolamento: dados dos estabelecimentos usam RLS com `withTenant`; consultas de plataforma e busca do convite por hash têm exceções. A tabela `memberships` é parte da arquitetura anterior e não possui RLS nem grant ao papel restrito: examine seus usos e filtros de sessão, sem presumir que a regra textual do plano já cobre essa exceção.
- O conector Easypanel exige preparar cada comando/operação, mostrar a prévia e receber aprovação explícita do Ricardo para aquele código antes de confirmar. Não copie segredos para relatórios.

## Referências e pendências

- [Plano completo](2026-10-27-plano-3-clientes-painel-plataforma.md), [decisões e pendências](2026-10-27-plano-3-pendencias.md), `docs/superpowers/specs/2026-10-24-eneven-agenda-inteligente-design.md`, `docs/design/telas/plano-3.md` e mockups em `docs/design/plano-3/`.
- Leia `AGENTS.md` e o guia pertinente de `node_modules/next/dist/docs/` antes de alterar código Next.js.
- Pendências conhecidas incluem confirmação ao cancelar convite, detector estático incompleto para importações de emissores de teste, CSS da faixa de suporte, auditoria do envio de convite ao dono fora da transação e corrida em `startSupport`. Consulte o arquivo de pendências para a lista completa.
- `SUPPORT_WHATSAPP` é opcional e não foi configurado nesta sessão; sem ele não aparece o botão de contato na faixa de somente leitura.
- Plano 4: lembretes pelo WhatsApp Cloud API; Plano 5: assinaturas Mercado Pago, limite de profissionais e carência; Plano 6: demonstração, dados e notificações push. Não iniciar esses planos automaticamente como parte da verificação do Plano 3.
