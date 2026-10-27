# Eneven Agendamentos Inteligentes

SaaS de agendamento multiempresa para negócios que trabalham com hora marcada (salões de beleza, estúdios de piercing, estética). Cada estabelecimento ganha um link público próprio, onde o cliente final agenda sozinho, um painel com agenda, clientes, faturamento e indicadores, e lembretes automáticos no WhatsApp que reduzem faltas. É vendido por assinatura barata e configurado pelo próprio estabelecimento, sem código novo por cliente.

## O que já funciona

- Cadastro (senha ou Google), confirmação de e-mail e assistente de primeiros passos (estabelecimento, horário, serviços e equipe).
- Página pública de agendamento em `/{slug}` (serviço, profissional, dia e horário, confirmação, calendário `.ics`, remarcar e cancelar por link) com prévia de compartilhamento.
- Painel: agenda (mês e dia, detalhe do agendamento, novo agendamento, bloqueios, confirmar, remarcar, atendido, faltou e cancelar), serviços, equipe e configurações (dados, marca, horário, regras e link).
- Menu com o link de agendamento para copiar, liberado quando o e-mail está confirmado e a conta está ativa ou em teste. Clientes e Painel de indicadores ficam como "Em breve".

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
pnpm test:e2e                            # página pública, agenda do painel e o fluxo completo
```

O comando sobe o `pnpm dev` na porta 3100 com um PGlite só dele (`.data/pglite-e2e`, apagado a cada execução) e a rota de apoio `/api/e2e/seed`, que cria estabelecimentos e agendamentos de teste. Essa rota só responde quando `E2E_SEED` está definido, o processo não é de produção e o cabeçalho `x-e2e-seed` traz o mesmo segredo; fora disso devolve 404. **Pare o `pnpm dev` antes de rodar** (o Next aceita um servidor de desenvolvimento por pasta). `tests/e2e/full-flow.spec.ts` percorre tudo: cadastro, primeiros passos, página pública, agenda, confirmar, remarcar e cancelar (a confirmação do e-mail é simulada pela rota de apoio). Para rodar só um arquivo: `pnpm test:e2e tests/e2e/full-flow.spec.ts`. Os testes ficam em `tests/e2e/`, fora do `pnpm test` e do CI por enquanto; a primeira execução é lenta porque o modo de desenvolvimento compila cada rota na primeira visita.

O CI (`.github/workflows/ci.yml`) roda lint, typecheck e testes a cada push na `main` e em todo pull request (uma nova execução na mesma branch cancela a anterior). O job `test-pg` sobe um PostgreSQL 17 e roda `pnpm test:pg` (RLS com `withTenant` e a trava de dupla reserva sob concorrência), o que o PGlite local não prova; localmente `pnpm test:pg` só roda com `TEST_DATABASE_URL` apontando para um Postgres (sem ela avisa e sai).

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
| `LEGAL_*` | opcionais |

O `APP_URL` também é um argumento da imagem (`ARG APP_URL`, padrão `https://agenda.eneven.com.br`) nos estágios de build e final: no build grava o endereço nas páginas estáticas e, na imagem final, vira a variável de ambiente padrão (a variável do Easypanel, se existir, prevalece). Em produção a aplicação nunca cai em `localhost`: sem `APP_URL` ela falha em vez de mandar links errados. Localmente, `pnpm build` funciona sem `APP_URL` (a checagem é ignorada só durante o `next build`), porque páginas estáticas como a inicial gravam nele o endereço da imagem de compartilhamento. Se o domínio mudar, passe `--build-arg APP_URL=...` (ou crie o argumento no Easypanel) e refaça o build.

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

**Gerar `dist/` localmente** (para testar fora do Docker): `pnpm build:migrate` e `pnpm build:admin`.

**App instalável (PWA).** `/manifest.webmanifest` vem de `src/app/manifest.ts` e o service worker é gerado em `public/sw.js` (modelo em `scripts/pwa/sw.template.js`; registrado só em produção). Ele guarda em cache apenas `/offline.html`, a logo leve e os ícones da marca; navegações vão sempre à rede e, sem conexão, mostram a página offline. Nada de `/api/*`, Server Actions ou páginas do painel entra no cache. A versão do cache (`CACHE_VERSION`) é o hash dos arquivos de `public/brand/`, calculado por `pnpm brand` (que roda no `predev` e no `prebuild`, inclusive no Docker): não há nada para aumentar à mão.

**Depois do deploy:** confira `https://agenda.eneven.com.br/api/health` (`{"status":"ok"}`), o manifest, o cadastro com e-mail de confirmação e a prévia do link no WhatsApp. `/api/health/db` confere o banco (`select 1`, 2 s; `503` se não responder). Cadastre o monitor no UptimeRobot em `/api/health` (e, se quiser, um segundo em `/api/health/db`) e ative o backup diário do banco no Easypanel.

## Documentação

- Documento de projeto: [docs/superpowers/specs/2026-10-24-eneven-agenda-inteligente-design.md](docs/superpowers/specs/2026-10-24-eneven-agenda-inteligente-design.md)
- Plano 1, fundação: [docs/superpowers/plans/2026-10-24-plano-1-fundacao.md](docs/superpowers/plans/2026-10-24-plano-1-fundacao.md)
