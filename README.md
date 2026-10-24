# Eneven Agendamentos Inteligentes

SaaS de agendamento multiempresa para negócios que trabalham com hora marcada (salões de beleza, estúdios de piercing, estética). Cada estabelecimento ganha um link público próprio, onde o cliente final agenda sozinho, um painel com agenda, clientes, faturamento e indicadores, e lembretes automáticos no WhatsApp que reduzem faltas. É vendido por assinatura barata e configurado pelo próprio estabelecimento, sem código novo por cliente.

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

O CI (`.github/workflows/ci.yml`) roda lint, typecheck e testes a cada push e pull request.

## Como trocar a logo

A logo oficial fica em `marca/logo.png`. Para trocá-la, substitua o arquivo mantendo o mesmo nome e formato e refaça o deploy. Ícones, favicons e imagens de compartilhamento são gerados por script a partir desse arquivo (em `public/brand/`, que não vai para o Git), então nada é editado à mão.

## Documentação

- Documento de projeto: [docs/superpowers/specs/2026-10-24-eneven-agenda-inteligente-design.md](docs/superpowers/specs/2026-10-24-eneven-agenda-inteligente-design.md)
- Plano 1, fundação: [docs/superpowers/plans/2026-10-24-plano-1-fundacao.md](docs/superpowers/plans/2026-10-24-plano-1-fundacao.md)
