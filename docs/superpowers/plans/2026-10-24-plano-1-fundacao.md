# Plano 1 — Fundação: projeto no ar com cadastro, login, PWA e ícones

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ter o Eneven Agendamentos Inteligentes publicado em `https://agenda.eneven.com.br`, instalável como PWA com os ícones da marca, onde um estabelecimento se cadastra (teste de 14 dias), confirma o e-mail, entra e vê o painel vazio, e onde o Ricardo existe como super-admin.

**Architecture:** Uma aplicação Next.js (App Router, TypeScript) serve páginas e API. PostgreSQL próprio acessado por Drizzle; testes rodam contra PGlite (Postgres em WASM) aplicando as mesmas migrações. Sessões em banco com cookie httpOnly. Ícones e imagens de compartilhamento são gerados por script (sharp) a partir de `marca/logo.png` antes de cada build. Deploy por Dockerfile no Easypanel a partir do GitHub.

**Tech Stack:** Next.js ≥ 16 (create-next-app@latest), React 19, TypeScript estrito, Tailwind CSS 4, shadcn/ui, Drizzle ORM + drizzle-kit, postgres (postgres-js), @electric-sql/pglite (testes), @node-rs/argon2, zod, sharp, png-to-ico, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-24-eneven-agenda-inteligente-design.md`

**Planos seguintes (fora deste):** 2 — Núcleo da agenda (serviços, profissionais, disponibilidade, reserva com constraint de exclusão, página pública, agenda do painel; **começa pela validação de mockups com o Ricardo**, spec §14) · 3 — Clientes, dashboard e painel do super-admin · 4 — Lembretes WhatsApp Cloud API · 5 — Assinatura Mercado Pago · 6 — Demonstração, LGPD (exportar/excluir) e push.

## Global Constraints

- Interface 100% em português do Brasil; valores em R$; datas `dd/mm/aaaa`; fuso padrão `America/Sao_Paulo`.
- Vocabulário: "estabelecimento" = tenant pagante; "cliente" = quem agenda. Nunca chamar o estabelecimento de "cliente" na interface.
- Identificadores de código e banco em inglês (`tenants`, `users`); rotas visíveis ao usuário em português (`/entrar`, `/cadastro`, `/painel`).
- Nome exibido: **Eneven Agendamentos Inteligentes**; nome curto do PWA: **Eneven Agenda**.
- Cores: `#3E07D2` → `#9429F7` → `#F581FB` (degradê), texto `#29303C`.
- Teste grátis: **14 dias**, começa sem cartão; e-mail do dono precisa ser confirmado antes de a página pública ser liberada.
- Ícones, favicons e imagens OG **sempre gerados** de `marca/logo.png`; nunca commitar ícones editados à mão. `public/brand/` é gerado e fica no `.gitignore`.
- Segredos só em variáveis de ambiente; `.env*` fora do git (exceto `.env.example`).
- DNS: registro A `agenda` → `178.104.38.201`, **sem proxy** no Cloudflare.
- Repositório **privado** `RicardovSantos/eneven-agenda-inteligente`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **E-mail com maiúsculas/espaços** (`" Dono@Salao.com "`): cadastro e login devem tratar como o mesmo e-mail (trim + lowercase) — teste em Task 4.
2. **Nome de estabelecimento que gera slug reservado ou repetido** ("Painel", "Defendi" duas vezes): o slug deve ganhar sufixo (`defendi-2`) e nunca colidir com rotas do sistema — teste em Task 3.
3. **Logo trocada por outra de tamanho/proporção diferente**: o script de ícones não pode quebrar nem distorcer; deve centralizar com margem — teste em Task 2.
4. **Sessão expirada ou de usuário sem vínculo com o estabelecimento** acessando `/painel`: redireciona para `/entrar`, nunca mostra dados — teste em Task 4.
5. **Link de confirmação de e-mail usado duas vezes ou vencido**: segunda vez mostra mensagem amigável, não erro 500 — teste em Task 5.

---

### Task 1: Esqueleto do projeto, qualidade e repositório no GitHub

**Files:**
- Create: projeto Next.js na raiz (`package.json`, `src/app/*`, `tsconfig.json`, etc. via create-next-app)
- Create: `vitest.config.ts`, `src/app/api/health/route.ts`, `tests/health.test.ts`
- Create: `README.md`, `.env.example`, `.gitignore` (acrescentar `public/brand/`, `.env*`, `!.env.example`)
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `GET /api/health` → `200 {"status":"ok"}`; scripts pnpm `dev`, `build`, `start`, `test`, `lint`, `typecheck`.

- [ ] **Step 1:** Rodar `pnpm create next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm` na raiz (a pasta já tem `docs/` e `marca/`; mover temporariamente se o CLI recusar pasta não vazia). Ativar `"strict": true`. Em `next.config.ts`: `output: "standalone"`.
- [ ] **Step 2:** Instalar `vitest` e configurar `vitest.config.ts` (environment `node`, alias `@` → `src`). Adicionar scripts `test: vitest run`, `typecheck: tsc --noEmit`.
- [ ] **Step 3: Teste que falha** — `tests/health.test.ts`:
  ```ts
  import { GET } from "@/app/api/health/route";
  it("responde ok", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
  ```
- [ ] **Step 4:** `pnpm test` → FAIL (módulo inexistente).
- [ ] **Step 5:** Implementar `GET(): Response` em `src/app/api/health/route.ts` com `export const dynamic = "force-dynamic"`.
- [ ] **Step 6:** `pnpm test && pnpm typecheck && pnpm lint` → tudo verde.
- [ ] **Step 7:** Inicializar shadcn/ui (`pnpm dlx shadcn@latest init`), definindo as cores da marca como tokens CSS (`--primary: #3E07D2`, `--accent: #9429F7`, `--foreground: #29303C`) em claro e escuro.
- [ ] **Step 8:** `README.md` em português: o que é o produto (1 parágrafo do spec §1), stack, como rodar (`pnpm i`, `cp .env.example .env`, `pnpm dev`), como testar, como trocar a logo (substituir `marca/logo.png` com mesmo nome e refazer o deploy), links para o spec e os planos. `.env.example` com `DATABASE_URL`, `APP_URL`, `SESSION_SECRET`, `ZEPTOMAIL_TOKEN`, `EMAIL_FROM`.
- [ ] **Step 9:** CI `.github/workflows/ci.yml`: on push/PR, Node 24, pnpm, `pnpm i --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- [ ] **Step 10:** `git init -b main`, commit `chore: esqueleto do projeto`. Criar repositório privado `eneven-agenda-inteligente` (mcp-github `criar_repo`), adicionar remote e `git push -u origin main`. Conferir o CI verde.

### Task 2: Ícones e imagens de compartilhamento gerados da logo

**Files:**
- Create: `marca/marca.config.json`, `scripts/brand/generate.ts`, `scripts/brand/crop.ts`
- Test: `tests/brand/generate.test.ts`, fixture `tests/fixtures/logo-quadrada.png` (gerada no próprio teste com sharp)
- Modify: `package.json` (`"brand": "tsx scripts/brand/generate.ts"`, `"prebuild": "pnpm brand"`, `"predev": "pnpm brand"`)

**Interfaces:**
- Produces: `generateBrandAssets(opts: { logoPath: string; outDir: string; config: BrandConfig }): Promise<string[]>` (retorna caminhos gerados).
- `BrandConfig = { symbolRegion: { left: number; top: number; width: number; height: number }; background: string; gradient: [string, string, string] }` — região em **frações** (0–1) da imagem; valores iniciais para a logo atual: `{ left: 0.10, top: 0.08, width: 0.19, height: 0.56 }` (ajustar visualmente na Step 5).
- Arquivos em `public/brand/`: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (180), `favicon.ico` (16+32+48), `icon-32.png`, `logo.png` (horizontal, fundo branco convertido em transparente), `og-default.png` (1200×630: logo horizontal centralizada sobre fundo claro com faixa no degradê).

- [ ] **Step 1: Teste que falha** — com uma logo sintética 800×300 e outra 500×500 (Review Focus 3):
  ```ts
  it("gera todos os ícones nos tamanhos certos", async () => {
    const files = await generateBrandAssets({ logoPath: fixture, outDir: tmp, config });
    expect(await size(`${tmp}/icon-512.png`)).toEqual({ width: 512, height: 512 });
    expect(await size(`${tmp}/apple-touch-icon.png`)).toEqual({ width: 180, height: 180 });
    expect(await size(`${tmp}/og-default.png`)).toEqual({ width: 1200, height: 630 });
    expect(files).toContain(`${tmp}/favicon.ico`);
  });
  it("maskable tem margem de segurança: canto é cor de fundo", async () => { /* pixel (5,5) == background */ });
  it("não distorce logo quadrada", async () => { /* roda com 500x500 sem lançar; ícone 512 existe */ });
  ```
- [ ] **Step 2:** `pnpm test tests/brand` → FAIL.
- [ ] **Step 3:** Implementar `crop.ts` (`extractSymbol(input: Buffer, region): Promise<Buffer>` — recorta região, `trim()` do branco, converte quase-branco em transparente) e `generate.ts` (sharp `resize` com `fit: "contain"`; maskable com o símbolo ocupando ≤ 60% do lado, centralizado; ICO via `png-to-ico`). O script CLI lê `marca/marca.config.json` e escreve em `public/brand/`.
- [ ] **Step 4:** `pnpm test tests/brand` → PASS.
- [ ] **Step 5:** `pnpm brand` com a logo real; abrir `public/brand/icon-512.png` e `apple-touch-icon.png` e conferir que o "E" com o ponto aparece inteiro e centralizado; ajustar `symbolRegion` em `marca.config.json` se cortar.
- [ ] **Step 6:** Commit `feat: geração de ícones e imagens a partir da logo`.

### Task 3: Banco de dados, migrações e slugs

**Files:**
- Create: `drizzle.config.ts`, `src/db/schema.ts`, `src/db/client.ts`, `src/db/migrate.ts`, `drizzle/` (migrações geradas)
- Create: `src/server/tenants/slug.ts`
- Test: `tests/helpers/test-db.ts`, `tests/tenants/slug.test.ts`, `tests/db/schema.test.ts`

**Interfaces:**
- Produces (schema Drizzle):
  - `tenants`: `id uuid pk default gen_random_uuid()`, `slug text unique not null`, `name text not null`, `status tenant_status not null default 'trial'` (enum: `trial | active | past_due | read_only | canceled`), `trialEndsAt timestamptz not null`, `timezone text not null default 'America/Sao_Paulo'`, `brandColor text`, `logoUrl text`, `whatsapp text`, `createdAt timestamptz default now()`.
  - `users`: `id uuid pk`, `email text unique not null` (sempre minúsculo), `passwordHash text not null`, `name text not null`, `isSuperAdmin boolean default false`, `emailVerifiedAt timestamptz`, `createdAt`.
  - `memberships`: `userId`, `tenantId` (fk, cascade), `role membership_role` (enum `owner | reception | staff`), pk composta.
  - `sessions`: `id text pk` (hash SHA-256 do token), `userId fk`, `tenantId fk null`, `expiresAt timestamptz`, `createdAt`.
  - `emailTokens`: `id text pk` (hash), `userId fk`, `purpose` (`verify | reset`), `expiresAt`, `usedAt timestamptz null`.
  - `auditLog`: `id bigserial`, `actorUserId`, `tenantId null`, `action text`, `details jsonb`, `createdAt`.
- `db` (postgres-js + drizzle) exportado de `src/db/client.ts`; `runMigrations(db)` em `src/db/migrate.ts`.
- `createTestDb(): Promise<Db>` em `tests/helpers/test-db.ts` — PGlite em memória + migrações.
- `slugify(name: string): string` e `generateUniqueSlug(db, name): Promise<string>`; `RESERVED_SLUGS` = `["painel","entrar","cadastro","admin","api","brand","demo","termos","privacidade","ajuda","suporte","sair","confirmar-email","recuperar-senha","agendamento","_next"]`.

- [ ] **Step 1: Testes que falham** — `slug.test.ts`:
  ```ts
  expect(slugify("Studio Harrod's Beleza & Cia")).toBe("studio-harrods-beleza-cia");
  expect(slugify("Ação Estética")).toBe("acao-estetica");
  // com "defendi" já existente:
  expect(await generateUniqueSlug(db, "Defendi")).toBe("defendi-2");
  expect(await generateUniqueSlug(db, "Painel")).toBe("painel-2");
  expect(await generateUniqueSlug(db, "!!!")).toMatch(/^estabelecimento(-\d+)?$/);
  ```
  `schema.test.ts`: inserir dois usuários com o mesmo e-mail → segundo lança erro de unicidade.
- [ ] **Step 2:** `pnpm test` → FAIL.
- [ ] **Step 3:** Escrever `schema.ts`, gerar migração (`pnpm drizzle-kit generate`), implementar `client.ts`, `migrate.ts`, `test-db.ts`, `slug.ts` (NFD sem acentos, minúsculo, não-alfanumérico → `-`, sem hífens nas pontas; vazio → `estabelecimento`).
- [ ] **Step 4:** `pnpm test` → PASS.
- [ ] **Step 5:** Commit `feat: schema base, migrações e slugs`.

### Task 4: Cadastro, login, sessão e proteção do painel

**Files:**
- Create: `src/server/auth/password.ts`, `src/server/auth/session.ts`, `src/server/auth/signup.ts`, `src/server/auth/login.ts`, `src/server/auth/guard.ts`
- Create: `src/app/(auth)/cadastro/page.tsx`, `src/app/(auth)/entrar/page.tsx`, `src/app/(auth)/actions.ts`, `src/app/painel/layout.tsx`, `src/app/painel/page.tsx`, `src/app/sair/route.ts`
- Create: `scripts/create-super-admin.ts`
- Test: `tests/auth/signup.test.ts`, `tests/auth/login.test.ts`, `tests/auth/guard.test.ts`

**Interfaces:**
- Consumes: schema e `generateUniqueSlug` (Task 3).
- Produces:
  - `hashPassword(p: string): Promise<string>`, `verifyPassword(hash, p): Promise<boolean>` (argon2id).
  - `signup(db, input: { businessName: string; ownerName: string; email: string; password: string; whatsapp: string }, now = new Date()): Promise<{ userId: string; tenantId: string; slug: string }>` — cria tenant `trial` com `trialEndsAt = now + 14 dias`, usuário e membership `owner` numa transação; senha mínima 8 caracteres (zod).
  - `login(db, email, password): Promise<{ userId: string } | null>`.
  - `createSession(db, userId, tenantId | null): Promise<string>` (token aleatório 32 bytes; grava hash; validade 30 dias); `getSession(db, token): Promise<SessionInfo | null>`; `destroySession(db, token)`.
  - `SessionInfo = { userId; tenantId: string | null; role: "owner"|"reception"|"staff"|null; isSuperAdmin: boolean; emailVerified: boolean }`.
  - `canAccessTenantPanel(session: SessionInfo | null): session is SessionInfo & { tenantId: string }` (pura: exige sessão, `tenantId` e `role` não nulos) e `requireTenantSession(): Promise<SessionInfo & { tenantId: string }>` em `guard.ts` — lê cookie `ea_session`, usa `getSession` + `canAccessTenantPanel`; se falso → `redirect("/entrar")`.
  - Cookie `ea_session`: httpOnly, secure em produção, sameSite `lax`, path `/`.
- [ ] **Step 1: Testes que falham:**
  ```ts
  // signup
  const r = await signup(db, { businessName: "Defendi Studio", ownerName: "Ana", email: " Ana@Defendi.com ", password: "senha-forte-1", whatsapp: "11999999999" }, new Date("2026-10-24T12:00:00Z"));
  expect(r.slug).toBe("defendi-studio");
  // tenant.status == "trial"; trialEndsAt == 2026-11-07T12:00:00Z; user.email == "ana@defendi.com"; membership.role == "owner"
  await expect(signup(db, { ...mesmoEmail })).rejects.toThrow(/e-mail já cadastrado/i);
  // login
  expect(await login(db, "ANA@defendi.com", "senha-forte-1")).toEqual({ userId: r.userId });
  expect(await login(db, "ana@defendi.com", "errada")).toBeNull();
  // sessão
  const t = await createSession(db, r.userId, r.tenantId);
  expect((await getSession(db, t))?.role).toBe("owner");
  // sessão vencida (expiresAt no passado) → null; usuário sem membership no tenant da sessão → role null
  // guard (Review Focus 4)
  expect(canAccessTenantPanel(null)).toBe(false);
  expect(canAccessTenantPanel({ ...sessao, role: null })).toBe(false);
  expect(canAccessTenantPanel({ ...sessao, tenantId: null })).toBe(false);
  expect(canAccessTenantPanel(sessao)).toBe(true);
  ```
- [ ] **Step 2:** `pnpm test tests/auth` → FAIL.
- [ ] **Step 3:** Implementar os módulos de `src/server/auth/`. Erros de domínio com mensagens em português.
- [ ] **Step 4:** `pnpm test tests/auth` → PASS.
- [ ] **Step 5:** Telas `/cadastro` e `/entrar` com shadcn (Card, Input, Button, Label), Server Actions em `actions.ts` validando com zod e mostrando erros no formulário; após cadastro → cria sessão e vai para `/painel`. `/painel` mostra "Olá, {nome}", o nome do estabelecimento, dias restantes do teste e o aviso "Confirme seu e-mail para liberar seu link de agendamento" quando não verificado. Visual simples com a marca: **essas telas serão refeitas após os mockups do Plano 2**.
- [ ] **Step 6:** `scripts/create-super-admin.ts` (`pnpm tsx scripts/create-super-admin.ts email nome`) pede senha via variável `SUPER_ADMIN_PASSWORD`, cria usuário com `isSuperAdmin = true` e e-mail verificado.
- [ ] **Step 7:** `pnpm dev` com um Postgres acessível (ver Task 6, Step 2: banco de desenvolvimento no Easypanel; ou `DATABASE_URL` apontando para ele) → cadastrar, sair, entrar; acessar `/painel` sem cookie redireciona para `/entrar`.
- [ ] **Step 8:** Commit `feat: cadastro, login e sessão`.

### Task 5: Confirmação de e-mail e recuperação de senha (ZeptoMail)

**Files:**
- Create: `src/server/email/send.ts`, `src/server/email/templates.ts`, `src/server/auth/email-tokens.ts`
- Create: `src/app/confirmar-email/page.tsx`, `src/app/recuperar-senha/page.tsx`, `src/app/recuperar-senha/[token]/page.tsx`
- Modify: `src/app/(auth)/actions.ts` (enviar confirmação após cadastro; botão "reenviar")
- Test: `tests/auth/email-tokens.test.ts`, `tests/email/send.test.ts`

**Interfaces:**
- Produces:
  - `sendEmail(msg: { to: string; subject: string; html: string }): Promise<void>` — POST `https://api.zeptomail.com/v1.1/email` com `Authorization: Zoho-enczapikey ${ZEPTOMAIL_TOKEN}`; sem `ZEPTOMAIL_TOKEN` (dev/teste) apenas registra no console.
  - `issueEmailToken(db, userId, purpose: "verify"|"reset", now?): Promise<string>` (validade: verify 48 h, reset 1 h).
  - `consumeEmailToken(db, token, purpose, now?): Promise<{ ok: true; userId: string } | { ok: false; reason: "invalid" | "expired" | "used" }>`.
  - `verifyEmail(db, token)`: marca `users.emailVerifiedAt`; `resetPassword(db, token, newPassword)`: troca senha e apaga todas as sessões do usuário.
- [ ] **Step 1: Testes que falham** (Review Focus 5):
  ```ts
  const t = await issueEmailToken(db, userId, "verify", now);
  expect(await consumeEmailToken(db, t, "verify", now)).toEqual({ ok: true, userId });
  expect(await consumeEmailToken(db, t, "verify", now)).toEqual({ ok: false, reason: "used" });
  const t2 = await issueEmailToken(db, userId, "verify", now);
  expect(await consumeEmailToken(db, t2, "verify", addHours(now, 49))).toEqual({ ok: false, reason: "expired" });
  expect(await consumeEmailToken(db, "lixo", "verify", now)).toEqual({ ok: false, reason: "invalid" });
  // token de reset não serve para verify → "invalid"
  // sendEmail sem token: não chama fetch (mock de fetch não invocado)
  ```
- [ ] **Step 2:** `pnpm test` → FAIL.
- [ ] **Step 3:** Implementar; templates HTML simples com logo (`${APP_URL}/brand/logo.png`), em português, remetente `EMAIL_FROM`.
- [ ] **Step 4:** `pnpm test` → PASS.
- [ ] **Step 5:** Páginas: `/confirmar-email?token=` mostra "E-mail confirmado" ou mensagem amigável por motivo (inválido, vencido com botão "reenviar", já usado → "já estava confirmado, entre"); "Esqueci minha senha" em `/entrar` → `/recuperar-senha` (sempre responde "se o e-mail existir, enviamos o link").
- [ ] **Step 6:** Commit `feat: confirmação de e-mail e recuperação de senha`.

### Task 6: PWA, metadados e deploy em agenda.eneven.com.br

**Files:**
- Create: `src/app/manifest.ts`, `public/sw.js`, `src/components/pwa/register-sw.tsx`, `src/components/pwa/install-hint.tsx`
- Modify: `src/app/layout.tsx` (metadata + viewport), `src/app/painel/layout.tsx` (InstallHint)
- Create: `Dockerfile`, `.dockerignore`, `scripts/start.sh`
- Test: `tests/pwa/manifest.test.ts`, `tests/pwa/metadata.test.ts`

**Interfaces:**
- Consumes: arquivos de `public/brand/` (Task 2), `runMigrations` (Task 3).
- Produces: `manifest(): MetadataRoute.Manifest` com `name: "Eneven Agendamentos Inteligentes"`, `short_name: "Eneven Agenda"`, `start_url: "/painel"`, `display: "standalone"`, `theme_color: "#3E07D2"`, `background_color: "#FFFFFF"`, `lang: "pt-BR"`, ícones 192/512 (`purpose: "any"`) e maskable 512 (`purpose: "maskable"`), `shortcuts`: "Agenda de hoje" (`/painel?view=dia`) e "Novo agendamento" (`/painel?novo=1`).
- `metadata` do layout raiz: `metadataBase: new URL(APP_URL)`, `title` template `"%s · Eneven Agenda"`, `icons` (`/brand/favicon.ico`, `/brand/icon-32.png`, `apple: /brand/apple-touch-icon.png`), `appleWebApp: { capable: true, title: "Eneven Agenda", statusBarStyle: "default" }`, `openGraph` (`/brand/og-default.png` 1200×630, `locale: "pt_BR"`, `siteName`), `twitter: { card: "summary_large_image" }`; `viewport.themeColor: "#3E07D2"`.
- [ ] **Step 1: Testes que falham:**
  ```ts
  const m = manifest();
  expect(m.short_name).toBe("Eneven Agenda");
  expect(m.icons?.some(i => i.purpose === "maskable" && i.sizes === "512x512")).toBe(true);
  expect(m.display).toBe("standalone");
  // metadata: icons.apple aponta para /brand/apple-touch-icon.png; openGraph.images[0].width === 1200
  ```
- [ ] **Step 2:** `pnpm test tests/pwa` → FAIL.
- [ ] **Step 3:** Implementar `manifest.ts` e metadata. `sw.js`: pré-cache dos ícones e da página offline mínima ("Sem conexão — o agendamento precisa de internet"); navegação network-first com fallback offline; **nunca** cachear `/api/*` nem respostas de Server Actions. `register-sw.tsx` registra só em produção. `install-hint.tsx`: no Android usa `beforeinstallprompt` (botão "Instalar app"); no iPhone (Safari, não standalone) mostra "Toque em Compartilhar → Adicionar à Tela de Início"; dispensável e lembrado em `localStorage`.
- [ ] **Step 4:** `pnpm test` → PASS; `pnpm build` (roda `prebuild` → ícones) sem erro.
- [ ] **Step 5:** Dockerfile multi-stage (node:24-alpine; `corepack enable`; `pnpm i --frozen-lockfile`; `pnpm build`; imagem final copia `.next/standalone`, `.next/static`, `public`, `drizzle/` e o migrador compilado); `scripts/start.sh` roda migrações e depois `node server.js`; porta 3000; `HEALTHCHECK` em `/api/health`.
- [ ] **Step 6: Infra (cada mudança com prévia e OK do Ricardo no mcp-easypanel):** criar projeto `eneven-agenda` no Easypanel com serviço Postgres 17 (`agenda-db`) e app `agenda-web` (source GitHub `RicardovSantos/eneven-agenda-inteligente`, branch `main`, build por Dockerfile); variáveis `DATABASE_URL` (interna do Postgres), `APP_URL=https://agenda.eneven.com.br`, `SESSION_SECRET` (aleatório), `ZEPTOMAIL_TOKEN`, `EMAIL_FROM`; domínio `agenda.eneven.com.br` na porta 3000 com HTTPS. Criar também um banco `agenda_dev` no mesmo Postgres para desenvolvimento local, se o Ricardo preferir a um Postgres local.
- [ ] **Step 7: DNS:** confirmar com mcp-cloudflare que a zona `eneven.com.br` está no Cloudflare; criar `A agenda → 178.104.38.201`, proxy desligado. Se a zona não estiver no Cloudflare, passar o registro ao Ricardo.
- [ ] **Step 8:** Deploy; criar o super-admin do Ricardo no container (`scripts/create-super-admin.ts`).
- [ ] **Step 9: Verificação em produção:** `curl https://agenda.eneven.com.br/api/health` → `{"status":"ok"}`; `https://agenda.eneven.com.br/manifest.webmanifest` lista os ícones; ícones abrem em `/brand/*`; cadastro real → e-mail de confirmação chega → painel; Lighthouse/DevTools "Installable" ok; colar o link no WhatsApp mostra a prévia com imagem; Ricardo instala no iPhone e no Android e confere o ícone.
- [ ] **Step 10:** Backup diário do `agenda-db`: ativar o backup agendado do Easypanel (retenção de 14 dias) ou, se indisponível, um serviço cron com `pg_dump` diário para volume; restaurar uma vez num banco de teste para provar que funciona.
- [ ] **Step 11:** Cadastrar monitor no UptimeRobot para `https://agenda.eneven.com.br/api/health`. Atualizar README com a seção "Deploy". Commit `feat: pwa, metadados e deploy` e push.
