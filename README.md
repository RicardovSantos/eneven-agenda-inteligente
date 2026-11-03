# Eneven Agendamentos Inteligentes

SaaS de agendamento multiempresa para negócios que trabalham com hora marcada (salões de beleza, estúdios de piercing, estética). Cada estabelecimento ganha um link público próprio, onde o cliente final agenda sozinho, um painel com agenda, clientes, faturamento e indicadores, e lembretes automáticos no WhatsApp que reduzem faltas. É vendido por assinatura barata e configurado pelo próprio estabelecimento, sem código novo por cliente.

### WhatsApp automático (Plano 4 em desenvolvimento)

Configure `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_API_VERSION` e `CRON_SECRET` no servidor. Configure o webhook da Meta e os modelos aprovados antes de ativar o envio. O app tem um relógio interno (`src/instrumentation.ts`, `src/server/whatsapp/timer.ts`) que roda um ciclo a cada 5 minutos (enfileira os lembretes e envia a fila) sozinho em produção, assim que `WHATSAPP_API_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` existem; ele supõe uma única réplica do serviço e pode ser desligado com `WHATSAPP_INTERNAL_TIMER=off`. A rota `POST /api/cron/whatsapp` (cabeçalho `Authorization: Bearer <CRON_SECRET>`) faz o mesmo ciclo e serve para teste manual ou para um agendador externo. Guarde os segredos fora do repositório.

O processamento reserva a franquia antes de enviar. Uma falha com resultado incerto exige revisão em `/admin/whatsapp`: confira na Meta se a mensagem foi aceita antes de concluir ou autorizar nova tentativa. Não há garantia de envio exatamente uma vez em falhas de comunicação. Eventos recebidos pendentes de revisão são cifrados com uma chave derivada de `SESSION_SECRET` e removidos após conclusão; trocar ou perder esse segredo impede decifrar os eventos antigos. Resolva as pendências antes da rotação ou preserve o segredo antigo de modo seguro para recuperação.

## O que já funciona

- Cadastro (senha ou Google), confirmação de e-mail e assistente de primeiros passos (estabelecimento, horário, serviços e equipe).
- Página pública de agendamento em `/{slug}` (serviço, profissional, dia e horário, confirmação, calendário `.ics`, remarcar e cancelar por link) com prévia de compartilhamento.
- Painel: agenda (mês e dia, detalhe do agendamento, novo agendamento, bloqueios, confirmar, remarcar, atendido, faltou e cancelar), serviços, equipe e configurações (dados, marca, horário, regras e link).
- Menu com o link de agendamento para copiar, liberado quando o e-mail está confirmado e a conta está ativa ou em teste.
- Clientes, Visão geral (indicadores do mês), acessos da equipe por convite e a Plataforma (`/admin`) do dono da Eneven, descritos abaixo.

### Página pública: fotos, equipe e informações

Em Configurações, "Página de agendamento" aceita até 3 imagens (ambiente, fachada, um trabalho) que passam sozinhas no topo da página, com título e frase editáveis; "Seu estabelecimento" ganhou o Facebook. Em Equipe, cada profissional tem cargo e foto. Toda imagem enviada, em qualquer formato, é convertida para WebP no navegador (para pesar pouco no envio) e de novo no servidor com `sharp` (`src/server/media/`), que é quem vale: carrossel 1600×920, profissional 480×480. A barra de progresso aparece só no envio das fotos pelo painel (convertendo e enviando). As imagens ficam no banco (`tenant_photos`, `professional_photos`, com RLS) e saem por `/api/midia/{slug}/capa/{0-2}` e `/api/midia/{slug}/profissional/{id}`, com cache longo e versão no endereço. O logo continua em PNG (ícones, e-mails e prévia de link dependem disso).

Na página pública, "Nossa equipe" leva cada cartão a `/{slug}/profissional/{id}`: o profissional já vem escolhido, a lista mostra só os serviços dele e o passo seguinte é a data. "Informações do estúdio" mostra o endereço (o toque em "Ver no mapa" oferece Waze, Google Maps ou Mapas da Apple), o horário de funcionamento agrupado por dias e os links do Instagram e do Facebook. A lista de serviços tem busca e, se o estabelecimento usar categorias, vira grupos que abrem e fecham (o primeiro vem aberto, o contador mostra quantos serviços do grupo foram escolhidos e a busca abre todos).

Categorias de serviço: em Serviços, o campo "Categoria" aceita um nome novo ou um já existente (sem diferenciar maiúsculas); a categoria nasce ao salvar o serviço e some quando fica sem serviços. Serviços sem categoria entram em "Outros serviços". Sem nenhuma categoria cadastrada, a lista continua sem grupos.

### Cobrança (Mercado Pago)

Assinatura mensal no cartão pela API de assinaturas da Mercado Pago (que só aceita cartão de crédito, débito e saldo em conta: Pix recorrente não existe nela). O dono assina e cancela em `/painel/configuracoes/assinatura`; o cancelamento mantém o acesso até o fim do período já pago, sem reembolso do mês. Reembolsos e contestações não mudam o acesso sozinhos: pedem revisão em `/admin/cobranca`.

Variáveis: `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_COLLECTOR_ID` (ID numérico do vendedor, o final do token), `MERCADO_PAGO_WEBHOOK_SECRET` e `MERCADO_PAGO_LIVE_MODE`. A cobrança real **só liga em produção** com `MERCADO_PAGO_LIVE_MODE=true`, token `APP_USR-` e vendedor numérico (`src/server/billing/mode.ts`); sem isso o webhook (`/api/webhooks/mercado-pago`) e o cron respondem 503. Um relógio interno (`src/instrumentation.ts`) roda a cada 10 minutos: processa os avisos, concilia vencimentos, encerra o acesso de assinaturas canceladas e avisa por e-mail os donos com fatura em atraso (carência de 7 dias). Webhook de produção: `https://agenda.eneven.com.br/api/webhooks/mercado-pago`, com os eventos de pagamentos e de assinaturas.

Fora de produção, contas de teste da Mercado Pago (tokens `APP_USR-` de usuário `TESTUSER…`) funcionam com `MERCADO_PAGO_SANDBOX=true` e `MERCADO_PAGO_LIVE_MODE=false`; o app confirma que a conta é de teste antes de criar qualquer assinatura. A Mercado Pago grafa o status `cancelled` (dois "l").

**Troca de plano** (`src/server/billing/change-plan.ts`): sem assinatura vale na hora. Com assinatura, o aumento libera o plano novo na hora e altera o valor das próximas cobranças (PUT no `/preapproval`, nada é cobrado na hora); a redução fica marcada e o relógio aplica um dia antes da próxima cobrança, só se os profissionais ativos couberem no limite do plano menor (senão cancela a troca e registra). O dono pode desfazer a redução marcada. Também há e-mails de fim do teste (3 dias antes e ao terminar), enviados uma vez cada pelo mesmo relógio.

### Profissional com foto em todas as telas

Onde a tela mostra quem atende, aparece a foto redonda do profissional com um anel na cor dele e o nome ao lado; sem foto, a inicial sobre a cor. Vale para a lista do dia na agenda (celular e computador, com o profissional numa linha própria abaixo do serviço), o detalhe do agendamento, o cabeçalho das colunas da agenda, as etiquetas de quem faz cada serviço, a edição do serviço e o novo agendamento. Os componentes são `PersonAvatar` e `PersonLabel` (`src/components/media/person-avatar.tsx`); a foto vem de `professionalPhotoUrl` (`src/server/media`). Na lista de serviços do celular, a duração fica numa linha e os profissionais sempre abaixo dela.

### Configuração geral e tema

Em `/painel/configuracoes`, a primeira seção, "Configuração geral", escolhe o tema: **Automático** (segue o aparelho, o padrão), **Claro** ou **Escuro**. A escolha fica salva **neste aparelho** (`localStorage`, chave `eneven-tema`), não na conta: em outro celular ou no computador é preciso escolher de novo. Um script no `<head>` (`src/app/layout.tsx`, `THEME_INIT_SCRIPT` em `src/lib/theme.ts`) põe a classe `light` ou `dark` no `<html>` antes da primeira pintura, sem piscar; o `globals.css` já responde a essas classes. Sem escolha salva, vale `prefers-color-scheme`.

### Baixar os dados do estabelecimento

Em Configurações, "Baixar dados do estabelecimento" entrega um JSON com os dados da conta (só o dono, fora do modo suporte; rota `GET /api/painel/exportar-agenda`). O botão (`ExportDataButton`) busca o arquivo em segundo plano e usa a folha de compartilhar do aparelho (Salvar em Arquivos, AirDrop...); onde ela não existe, faz o download normal. Um link `download` abria o JSON em tela cheia no iPhone com o app instalado, sem botão de voltar. A logo vai dentro do arquivo em base64.

### Telas de entrada no celular

A casca das telas de entrada (`AuthShell`: entrar, cadastro, recuperar senha, convite, confirmar e-mail) ocupa exatamente a área visível no celular (`fixed inset-0`) e só rola por dentro quando o conteúdo não cabe (teclado aberto, tela baixa). Antes duas alturas `min-h-dvh` empilhadas deixavam a página rolar solta, com espaço vazio embaixo, no iPhone. No computador continua em duas colunas.

### Clientes

`/painel/clientes`: lista com busca por nome ou WhatsApp (o cliente entra sozinho ao agendar pelo link, ou é criado à mão em "Novo cliente"), ficha com contato, observações (salvas ao sair do campo), histórico de atendimentos, total gasto e o botão "Agendar", que abre o novo agendamento com o cliente já escolhido. WhatsApp repetido é recusado com um atalho para o cadastro existente. Profissionais veem só os clientes que atenderam e não veem o total gasto.

### Visão geral

"Painel" no menu abre `/painel/visao-geral` (só o proprietário): faturamento realizado do mês e comparação com o anterior, ticket médio, previsto para os próximos 30 dias, taxa de faltas, agendamentos por dia (gráfico com tooltip por mouse, toque ou teclado, e tabela para leitores de tela), serviços mais vendidos e faturamento por profissional. Atendimentos que já terminaram sem resultado aparecem num aviso com "Revisar agora", que marca atendido ou faltou ali mesmo. O mês fica na URL (`?mes=2026-10`).

### Acessos da equipe

Em Configurações, o cartão "Acessos da equipe" convida pessoas por e-mail como **Recepção** (agenda, clientes, serviços e equipe) ou **Profissional** (só a própria agenda e os próprios clientes), cancela ou reenvia convites e remove acessos. O link do convite (`/convite/{token}`) vale uma vez e por tempo limitado; quem aceita cria a senha ou entra com o Google. Quem já tem vínculo com outro estabelecimento ainda não pode aceitar (a escolha de estabelecimento fica para depois).

### Plataforma (`/admin`)

Só para o super-admin (dono da plataforma): lista de estabelecimentos com busca, filtro por situação e números (MRR, em teste, agendamentos dos últimos 30 dias), ficha com histórico, estender o teste, trocar o plano, bloquear (modo somente leitura: a página pública sai do ar e o painel não marca novos horários), cancelar a conta, criar um estabelecimento e enviar o acesso ao dono por e-mail, e editar os planos em `/admin/planos`. "Entrar como o estabelecimento" abre o painel do salão em modo suporte, com uma faixa no topo e registro no histórico, até "Voltar à plataforma". Para dar esse acesso a uma conta, veja "Promover um usuário que já existe a super-admin" em [Deploy](#deploy).

## Stack

- Next.js (App Router) + TypeScript, aplicação única (página pública, painéis e API)
- Tailwind CSS v4 + shadcn/ui, com tema claro e escuro
- PostgreSQL com Drizzle, multiempresa por `tenant_id` (planos seguintes)
- Vitest para testes, ESLint para lint
- pnpm como gerenciador de pacotes

## Como rodar

```bash
pnpm i
cp .env.example .env
pnpm dev
```

A aplicação abre em http://localhost:3000. A verificação de saúde responde em `GET /api/health` com `{"status":"ok"}`.

## Variáveis de ambiente

O `.env.example` lista todas. Em produção (`NODE_ENV=production`) algumas são obrigatórias:

| Variável | Para quê | Em produção |
|---|---|---|
| `DATABASE_URL` | PostgreSQL | obrigatória |
| `APP_URL` | endereço público (links dos e-mails e retorno do Google) | obrigatória: sem ela as páginas e os links dos e-mails falham com `APP_URL não definido` (o `next build` não exige) |
| `SESSION_SECRET` | assina o cookie temporário do Google (`openssl rand -hex 32`) | obrigatória, e também sempre que `APP_URL` for https |
| `ZEPTOMAIL_TOKEN` | envio de e-mails; pode ser colado com ou sem o prefixo `Zoho-enczapikey ` | obrigatória (sem ela o envio falha; em desenvolvimento o e-mail só aparece no console) |
| `ZEPTOMAIL_URL` | endereço da API do ZeptoMail (padrão `https://cpaas.zoho.com/v1.1/email`, precisa ser https) | opcional |
| `EMAIL_FROM` | remetente (`nao-responda@eneven.com.br`) | obrigatória com o token |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | botão "Entrar com Google" | opcionais |
| `LEGAL_OWNER_NAME`, `LEGAL_OWNER_DOC`, `LEGAL_CONTACT_EMAIL` | responsável, CPF ou CNPJ (omitido se vazio) e e-mail de contato nas páginas `/termos` e `/privacidade` | opcionais (padrões: Ricardo Santos e eneventech@gmail.com) |
| `SUPPORT_WHATSAPP` | WhatsApp da Eneven com DDI (`5511999999999`): botão "Falar com a Eneven" na faixa de somente leitura do painel; sem ela a faixa aparece sem o botão | opcional |

## Termos de uso e política de privacidade

As páginas públicas `/termos` e `/privacidade` vêm do texto em `src/content/legal.ts` (transcrito do rascunho em `docs/legal/termos-e-privacidade.md`, que pede revisão jurídica). Ao mudar o texto, atualize `LEGAL_LAST_UPDATED` no mesmo arquivo; as variáveis `LEGAL_*` são lidas a cada acesso, sem novo build.

## Limite de tentativas

Login (10 tentativas por IP e e-mail e 30 por IP, a cada 15 minutos), cadastro (5 por hora por IP) e recuperação de senha (5 por hora por IP e por e-mail) têm limite. A contagem fica na memória do processo, o que basta enquanto o serviço roda em uma instância só (Easypanel); com mais de uma, troque por um armazenamento compartilhado (`src/server/security/`). O IP vem do **último** item de `x-forwarded-for`, que é o endereço que o Traefik do Easypanel viu na conexão (os itens anteriores podem ser forjados pelo cliente, por isso não valem). Isso vale com o DNS da Cloudflare só em modo DNS (nuvem cinza, um único salto de proxy). Se um dia ligar o proxy da Cloudflare (nuvem laranja), o último item passa a ser o IP da Cloudflare: troque a leitura em `getClientIp` (`src/server/security/rate-limit.ts`) para o cabeçalho `CF-Connecting-IP` e configure `trustedIPs` do Traefik com as faixas de IP da Cloudflare, para ninguém forjar esse cabeçalho. Sem `x-forwarded-for`, em produção, aparece um aviso no log e todos contam como o mesmo IP. Cada limitador guarda no máximo 10 000 chaves (as mais antigas saem primeiro).

## Entrar com o Google

O botão "Entrar com Google" e "Criar conta com Google" só aparece quando `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` estão no `.env`. Sem eles tudo funciona só com e-mail e senha. Para criar as credenciais:

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/), crie (ou escolha) um projeto e abra **APIs e serviços**.
2. Em **Tela de permissão OAuth** (ou "Google Auth Platform"), escolha o tipo de usuário **Externo**, preencha o nome do app (Eneven Agendamentos Inteligentes), o e-mail de suporte e o domínio `eneven.com.br`. Em **Escopos** adicione `openid`, `email` e `profile` (são os escopos básicos, não exigem verificação do app). Enquanto o app estiver em "Teste", adicione os e-mails de quem vai testar; para liberar a qualquer pessoa, clique em **Publicar app**.
3. Em **Credenciais**, clique em **Criar credenciais > ID do cliente OAuth** e escolha o tipo **Aplicativo da Web**.
4. Em **URIs de redirecionamento autorizados** cadastre exatamente:
   - `http://localhost:3000/api/auth/google/callback`
   - `https://agenda.eneven.com.br/api/auth/google/callback`
5. Copie o **ID do cliente** e a **chave secreta** para `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env` (em produção, nas variáveis do serviço). `APP_URL` precisa ter o endereço público da aplicação, porque o redirecionamento é montado a partir dele, e `SESSION_SECRET` assina o cookie temporário do cadastro (gere com `openssl rand -hex 32`).

Quem entra pelo Google com um e-mail que já tem conta na Eneven é ligado a essa conta; quem é novo informa só o nome do estabelecimento e o WhatsApp.

## Como testar

```bash
pnpm test        # testes (Vitest)
pnpm lint        # ESLint
pnpm typecheck   # TypeScript
pnpm build       # build de produção
```

### Testes de ponta a ponta (Playwright)

```bash
pnpm exec playwright install chromium   # uma vez
pnpm test:e2e                            # a suíte inteira (tests/e2e/*.spec.ts)
```

O comando sobe o `pnpm dev` na porta 3100 com um PGlite só dele (`.data/pglite-e2e`, apagado a cada execução) e a rota de apoio `/api/e2e/seed`, que cria estabelecimentos, agendamentos, sessões, convites e o super-admin de teste. Essa rota só responde quando `E2E_SEED` está definido, o processo não é de produção e o cabeçalho `x-e2e-seed` traz o mesmo segredo; fora disso devolve 404. **Pare o `pnpm dev` antes de rodar** (o Next aceita um servidor de desenvolvimento por pasta). Antes dos testes, `tests/e2e/global-setup.ts` visita algumas rotas públicas e do painel, porque o modo de desenvolvimento compila cada rota na primeira visita. `tests/e2e/full-flow.spec.ts` percorre tudo: cadastro, primeiros passos, página pública, agenda, confirmar, remarcar e cancelar (a confirmação do e-mail é simulada pela rota de apoio). Para rodar só um arquivo: `pnpm test:e2e tests/e2e/full-flow.spec.ts`.

Regras para a suíte continuar estável: cada teste cria o próprio estabelecimento pela rota de apoio (nunca usa dados de outro arquivo), datas são relativas ao dia de hoje em São Paulo (nada de data fixa que caia no passado ou num domingo) e as esperas são por estado da tela (`expect(...).toBeVisible()`, `expect.poll`), nunca por tempo.

As specs de captura de tela para revisão visual ficam em `tests/e2e/`, mas são excluídas da suíte padrão. Para executá-las, defina `SHOTS_DIR` e rode `pnpm exec playwright test -c playwright.capturas.config.ts` (crie o diretório de saída antes).

O CI (`.github/workflows/ci.yml`) roda lint, typecheck e testes a cada push na `main` e em todo pull request (uma nova execução na mesma branch cancela a anterior). O job `test-pg` sobe um PostgreSQL 17 e roda `pnpm test:pg` (RLS com `withTenant` e a trava de dupla reserva sob concorrência), o que o PGlite local não prova; localmente `pnpm test:pg` só roda com `TEST_DATABASE_URL` apontando para um Postgres (sem ela avisa e sai). O job `e2e` instala o Chromium do Playwright e roda `pnpm test:e2e` com o mesmo servidor de desenvolvimento e PGlite próprio (a rota de apoio continua desligada em produção); se falhar, os traces ficam no artefato `playwright-traces` da execução (abra com `pnpm exec playwright show-trace <arquivo>.zip`).

## Como trocar a logo

A logo oficial fica em `marca/logo.png`. Para trocá-la, substitua o arquivo mantendo o mesmo nome e formato e refaça o deploy. Ícones, favicons, a logo leve dos e-mails (`logo-email.png`, 320 px) e as imagens de compartilhamento são gerados por script (`pnpm brand`, que roda sozinho antes do `dev` e do `build`) a partir desse arquivo, em `public/brand/` (que não vai para o Git), então nada é editado à mão. O mesmo script gera `public/sw.js` a partir de `scripts/pwa/sw.template.js`, com um hash dos arquivos de `public/brand/` no `CACHE_VERSION`: ao trocar a logo o cache do service worker se renova sozinho. O recorte do símbolo é configurado em `marca/marca.config.json`; o script valida o arquivo e avisa se a logo não existe ou se `symbolRegion` não pega o símbolo.

## Deploy

A aplicação roda em um container (`Dockerfile`, Node 24 Alpine) no Easypanel, em `https://agenda.eneven.com.br`, com um serviço PostgreSQL ao lado.

**Como a imagem é feita.** O estágio de build instala todas as dependências dentro do Alpine, roda `pnpm build` (que antes gera os ícones em `public/brand/` a partir de `marca/logo.png`) e compila os dois scripts de operação em `dist/`. A imagem final leva só o servidor standalone do Next, `public/`, `drizzle/` e `dist/`, roda como usuário sem privilégios na porta 3000 e tem `HEALTHCHECK` em `/api/health`. Ao subir, `scripts/start.sh` aplica as migrações pendentes (`node dist/migrate.mjs`) e só então inicia o servidor; se a migração falhar, o container não sobe.

**Variáveis do serviço (Easypanel)**

| Variável | Valor |
|---|---|
| `DATABASE_URL` | endereço interno do PostgreSQL (`postgres://usuario:senha@agenda-db:5432/banco`) |
| `APP_URL` | `https://agenda.eneven.com.br` |
| `SESSION_SECRET` | aleatório (`openssl rand -hex 32`) |
| `ZEPTOMAIL_TOKEN` e `EMAIL_FROM` | envio de e-mails |
| `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` | opcionais |
| `SUPPORT_WHATSAPP` | opcional (`5511999999999`): botão "Falar com a Eneven" na faixa de somente leitura |
| `LEGAL_*` | opcionais |

O `APP_URL` também é um argumento da imagem (`ARG APP_URL`, padrão `https://agenda.eneven.com.br`) nos estágios de build e final: no build grava o endereço nas páginas estáticas e, na imagem final, vira a variável de ambiente padrão (a variável do Easypanel, se existir, prevalece). Em produção a aplicação nunca cai em `localhost`: sem `APP_URL` ela falha em vez de mandar links errados. Localmente, `pnpm build` funciona sem `APP_URL` (a checagem é ignorada só durante o `next build`), porque páginas estáticas como a inicial gravam nele o endereço da imagem de compartilhamento. Se o domínio mudar, passe `--build-arg APP_URL=...` (ou crie o argumento no Easypanel) e refaça o build.

**Latência (São Paulo).** O servidor atual fica em Nuremberg (Hetzner): a ida e volta até `/api/health` foi de cerca de 217 ms em 02/11/2026, e quase todo o tempo de cada navegação no painel é rede. Está decidido mover só o `agenda-web` e o `agenda-db` para uma VPS em São Paulo (a Hostinger KVM 2 foi a escolhida), mas **a migração ainda não foi feita**. Ao migrar: o app supõe uma única réplica, então desligue os relógios internos do servidor antigo assim que o novo ligar (`WHATSAPP_INTERNAL_TIMER=off` para o do WhatsApp; o de cobrança só roda com `MERCADO_PAGO_LIVE_MODE=true`), copie o `SESSION_SECRET` (cifra eventos pendentes do WhatsApp) e aponte o registro `A agenda` para o IP novo, sem proxy.

**Domínio e DNS.** Registro `A agenda` apontando para o IP da VPS, com o proxy da Cloudflare desligado (nuvem cinza); o Easypanel emite o HTTPS. Domínio do serviço na porta 3000.

**Usuário do banco.** `findBookingByManageToken` (link de gestão `/agendamento/{token}`) procura o agendamento fora do RLS, porque o estabelecimento ainda não é conhecido: ela depende de o usuário do `DATABASE_URL` ser superusuário ou dono das tabelas. Se um dia o usuário da conexão for trocado por um sem esses privilégios, revise essa busca antes (as demais consultas passam por `withTenant`).

**Migrações à mão** (dentro do container, no terminal do Easypanel):

```bash
node dist/migrate.mjs
```

**Criar o super-admin** (dono da plataforma; a senha vem só da variável de ambiente, com 12 caracteres ou mais):

```bash
SUPER_ADMIN_PASSWORD='uma-senha-longa' node dist/create-super-admin.mjs email@exemplo.com "Nome"
```

**Promover um usuário que já existe a super-admin** (por exemplo, a sua conta de dono de estabelecimento; não pede senha nem mexe nela):

```bash
node dist/create-super-admin.mjs --promote email@exemplo.com
```

Depois de entrar, o menu do painel ganha "Plataforma" (`/admin`): lista de estabelecimentos, planos, "Entrar como o estabelecimento" (modo suporte, com faixa e registro no histórico) e "Meu estabelecimento" de volta ao seu painel.

**Gerar `dist/` localmente** (para testar fora do Docker): `pnpm build:migrate` e `pnpm build:admin`.

**App instalável (PWA).** `/manifest.webmanifest` vem de `src/app/manifest.ts` e o service worker é gerado em `public/sw.js` (modelo em `scripts/pwa/sw.template.js`; registrado só em produção). Ele guarda em cache apenas `/offline.html`, a logo leve e os ícones da marca; navegações vão sempre à rede e, sem conexão, mostram a página offline. Nada de `/api/*`, Server Actions ou páginas do painel entra no cache. A versão do cache (`CACHE_VERSION`) é o hash dos arquivos de `public/brand/`, calculado por `pnpm brand` (que roda no `predev` e no `prebuild`, inclusive no Docker): não há nada para aumentar à mão.

**Depois do deploy:** confira `https://agenda.eneven.com.br/api/health` (`{"status":"ok"}`), o manifest, o cadastro com e-mail de confirmação e a prévia do link no WhatsApp. `/api/health/db` confere o banco (`select 1`, 2 s; `503` se não responder). Cadastre o monitor no UptimeRobot em `/api/health` (e, se quiser, um segundo em `/api/health/db`) e ative o backup diário do banco no Easypanel.

## Documentação

- Documento de projeto: [docs/superpowers/specs/2026-10-24-eneven-agenda-inteligente-design.md](docs/superpowers/specs/2026-10-24-eneven-agenda-inteligente-design.md)
- Plano 1, fundação: [docs/superpowers/plans/2026-10-24-plano-1-fundacao.md](docs/superpowers/plans/2026-10-24-plano-1-fundacao.md)
- Plano 2, agenda: [docs/superpowers/plans/2026-10-24-plano-2-agenda.md](docs/superpowers/plans/2026-10-24-plano-2-agenda.md) (pendências em [2026-10-24-plano-2-pendencias.md](docs/superpowers/plans/2026-10-24-plano-2-pendencias.md))
- Plano 3, clientes, painel e plataforma: [docs/superpowers/plans/2026-10-27-plano-3-clientes-painel-plataforma.md](docs/superpowers/plans/2026-10-27-plano-3-clientes-painel-plataforma.md) (pendências em [2026-10-27-plano-3-pendencias.md](docs/superpowers/plans/2026-10-27-plano-3-pendencias.md))
