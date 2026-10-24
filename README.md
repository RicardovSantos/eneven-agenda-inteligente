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
