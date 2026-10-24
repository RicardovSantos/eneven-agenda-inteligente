# Pendências deixadas pelo Plano 1 (Fundação)

Itens menores anotados nas revisões e não corrigidos antes do primeiro deploy. Usar como insumo dos próximos planos.

## Decisões do controller (rulings)
- Ruling R1: T1 não roda `git init`; commita na branch `plano-1-fundacao`. Criação do repo privado no GitHub e push de `main` + branch feitos pelo implementer do T1 (Ricardo autorizou subir ao GitHub). — plano supunha repo inexistente — custo se errado: nenhum, só ordem de commits.
- Ruling R2: se create-next-app recusar a pasta, gerar em pasta temporária e copiar para a raiz, mesclando `.gitignore`. — CLI recusa pastas com arquivos — custo: nenhum.
- Ruling R3: fixtures de logo geradas no próprio teste com sharp; sem arquivo em tests/fixtures. — evita binário no repo — custo: nenhum.
- Ruling R4: `export type Db = PgDatabase<PgQueryResultHKT, typeof schema>` (drizzle-orm/pg-core) em `src/db/types.ts`; todas as funções de servidor recebem `Db`; prod usa postgres-js, testes PGlite. — permite as duas implementações — custo: ajuste de tipo se drizzle mudar API.
- Ruling R5: `src/db/client.ts` usa PGlite em arquivo (`./.data/pglite`, no .gitignore) quando `DATABASE_URL` não está definido e `NODE_ENV !== "production"`; em produção sem `DATABASE_URL` lança erro. Migrações aplicadas na inicialização em dev. — permite rodar `pnpm dev` sem Postgres local — custo: pequena diferença dev/prod (mitigada: CI e prod usam o mesmo SQL).
- Ruling R6: `metadata` e `viewport` ficam em `src/app/site-metadata.ts`, reexportados pelo `layout.tsx`; o teste importa de lá. — next/font não roda no vitest — custo: nenhum.
- Ruling R7: implementer do T6 faz só código (Steps 1–5 + seção Deploy do README). Steps 6–11 (Easypanel, DNS, super-admin, verificação, backup, UptimeRobot) feitos pelo controller com prévia/OK do Ricardo. — ações externas exigem confirmação — custo: nenhum.
- Ruling R8: Ricardo delegou toda a direção visual ao controller (Opus); Sonnet só executa. Fonte de verdade visual: docs/design/sistema-visual.md (tokens, Outfit+Figtree, fio do tempo). O T4 aplica os tokens/fontes em globals.css (sobrescrevendo os do T1) e constrói cadastro/login no layout de duas colunas descrito lá. Toda tarefa de UI recebe esse doc na dispatch. — pedido explícito do Ricardo — custo: retrabalho visual se ele não gostar dos mockups.
- Ruling R9: symbolRegion medido pelo controller: { left: 0.11, top: 0.09, width: 0.175, height: 0.505 } (E com ponto em x 251–612, y 74–424 de 2172×724). Ícones de app/apple/maskable com fundo branco #FFFFFF; og-default com fio do tempo (linha degradê 4px com ponto) sob a logo em vez de "faixa no degradê" do plano. — direção visual delegada ao controller (R8) — custo: só visual.
- Ruling R10: pnpm-workspace.yaml do T1 tem `allowBuilds: sharp: false`; T2 muda para `sharp: true` para garantir binário do sharp. — sharp é dependência central do T2 — custo: nenhum.
- Ruling R11: WhatsApp do cadastro normalizado para dígitos com DDI 55 ("5511999999999"); aceita 10 ou 11 dígitos nacionais (com ou sem máscara/+55); armazenado assim em tenants.whatsapp. — padrão para wa.me e Cloud API depois — custo: migração de dados se mudar formato.
- Ruling R12: signup refaz geração de slug até 3 vezes em violação 23505 de tenants_slug_unique (error.cause.code). — corrida check-then-insert apontada no T3 — custo: nenhum.
- Ruling R13: mensagem de e-mail duplicado segue a spec de telas ("Este e-mail já tem uma conta. Entre ou recupere a senha."); o teste do plano passa a usar /já tem uma conta/i em vez de /e-mail já cadastrado/i. Logout via POST /sair; GET redireciona ao painel. Slugify extraído para src/lib se precisar rodar no cliente. — spec de telas é a fonte de texto — custo: nenhum.
- Ruling R14: Ricardo pediu login com Google (24-10-2026). Acrescentada Task 7 ao plano; ordem de execução: 1,2,3,4,5,7,6 (Google antes do deploy). Spec §6/§12 e telas/entrada.md atualizados pelo controller. — pedido explícito — custo: credenciais OAuth dependem do Ricardo; sem elas o botão fica oculto.
- Ruling R15: no tema escuro usar uma variante `logo-dark.png` gerada pelo script de marca (pixels do texto escuro ~#29303C recoloridos para #ECEAF5, mantendo o degradê), servida via <picture>/media prefers-color-scheme; remove a plaquinha. Vai junto na dispatch da Task 7. — plaquinha parece adesivo — custo: só visual.
- Ruling R16: rate limit de login/cadastro/recuperação vira item obrigatório do lote de polimento antes do deploy público (limite em memória por IP+e-mail: 10 tentativas/15 min login, 5/h cadastro e recuperação). — risco de força bruta/DoS — custo: pequeno.
- Ruling R17: páginas públicas /termos e /privacidade (conteúdo LGPD real escrito pelo controller) entram no lote de polimento antes do deploy — exigidas pela LGPD, linkadas no cadastro e informadas na tela de consentimento OAuth do Google. — custo: revisão jurídica recomendada ao Ricardo.
- Ruling R18: ZeptoMail virou Zoho CPaaS (endpoint novo cpaas.zoho.com/v1.1/email). No polimento: URL configurável por ZEPTOMAIL_URL (padrão https://api.zeptomail.com/v1.1/email, que o mcp-email do Ricardo usa) e aceitar token com ou sem prefixo 'Zoho-enczapikey '; em produção sem token, falhar alto. Remetente: nao-responda@eneven.com.br, nome 'Eneven Agenda'. — evita quebra no deploy — custo: nenhum.
- Ruling R19: pré-sequestro — ao vincular Google a usuário com emailVerifiedAt nulo: apagar passwordHash, todas as sessões e tokens não usados, marcar verificado, audit_log google_link; usuário já verificado vincula sem mexer. Enviado ao implementer antes da review. — padrão de mercado contra account pre-hijacking — custo: dono legítimo não verificado precisa redefinir senha se quiser senha.
- Ruling R20: Task 8 (polimento/endurecimento) acrescentada ao plano; ordem final 1,2,3,4,5,7,8,6. — reúne R16/R17/R18 e minors relevantes antes de expor ao público — custo: ~1 tarefa a mais.
- Ruling R18b: padrão de ZEPTOMAIL_URL = https://cpaas.zoho.com/v1.1/email (host mostrado no agente Eneven-Agenda criado pelo Ricardo); remetente nao-responda@eneven.com.br confirmado.
- Ruling R21: Easypanel do Ricardo é plano free (máx. 3 projetos) → serviços agenda-web (app) e agenda-db (Postgres próprio) dentro do projeto existente 'eneven', não num projeto novo. Banco continua separado do eneven-hub-db. — pedido do Ricardo — custo: nenhum.
- Ruling R22: getClientIp usa o ÚLTIMO item do X-Forwarded-For (o que o Traefik viu na conexão); aviso único em produção se faltar XFF; README documenta troca para CF-Connecting-IP se o proxy do Cloudflare for ligado. — plano mandava o 1º item; a spec exige proteção real contra força bruta — custo: se houver mais de um proxy no caminho no futuro, revisar.
- Ruling R23: limiter checa o limite por IP antes do por e-mail e tem teto de 10 000 chaves (despejo do mais antigo). — memória limitada — custo: nenhum.
- Ruling R24: cookie de sessão __Host-ea_session em produção antes do 1º deploy. — evita cookie tossing por subdomínios irmãos; trocar depois deslogaria todos — custo: nenhum agora.
- Ruling R25: onda única de correção da revisão final inclui os 3 Important + minors baratos pré-deploy: headers de segurança, / → /entrar, página /admin mínima para super-admin, /api/health/db, teto por e-mail 100/24h no login, logo-email.png leve (e-mails/offline/SW), CACHE_VERSION do SW derivado do hash dos assets de marca. Brief: final-fix-brief.md. — melhor corrigir antes de expor — custo: uma rodada.
- Ruling R26: deploy a partir de main após merge de plano-1-fundacao (pedir OK ao Ricardo para o merge). Manter 1 réplica (migrator sem advisory lock).

## Pendências menores
- Task 1: minor (deferred): CI sem filtro de branch/permissions/concurrency (roda 2x em PR)
- Task 1: minor (deferred): Geist ainda no layout; Outfit/Figtree entram no T4 (next/font/google precisa de rede no build do Docker — conferir no T6)
- Task 1: minor (deferred): dark mode só por classe .dark, sem alternância ainda
- Task 1: minor (deferred): AGENTS.md do scaffold commitado (inofensivo)
- Task 2: minor (deferred): guarda de entry-point compara import.meta.url com argv[1] sem realpath → `pnpm brand` poderia sair 0 sem gerar nada
- Task 2: minor (deferred): região errada após trocar a logo gera ícones em branco sem erro; config sem validação; logo ausente = ENOENT cru (relevante para a troca de logo do Ricardo)
- Task 2: minor (deferred): bordas anti-aliased mantêm tom claro (só alpha muda)
- Task 2: minor (deferred): testes sem rampa 230–245, sem medir largura 760/linha 4×360/48px, sem caminhos de falha
- Task 2: minor (deferred): comentário enganoso generate.ts:1027; esbuild sem entrada em allowBuilds; tsx é devDependency (Dockerfile do T6 deve instalar devDeps no estágio de build)
- Task 3: minor (deferred): template do test-db reconstruído por arquivo (~6 s cada) — globalSetup/cache em disco
- Task 3: minor (deferred): PGlite de teste não fechado em afterEach
- Task 3: minor (deferred): teste de e-mail maiúsculo deveria checar cause.code 23514
- Task 3: minor (deferred): sem índice em sessions.tenant_id e audit_log.actor_user_id
- Task 3: minor (deferred): lacunas de teste de slug (>20 colisões, apóstrofo unicode, ß/ø/æ viram hífen)
- Task 3: minor (deferred): db:migrate usa tsx --env-file-if-exists; esbuild target node20; detecção de driver por duck-type; migrator sem advisory lock (rodar de um entrypoint só)
- Task 3: minor (deferred): task-3-report.md:53-55 texto antigo contraditório (doc); stub só cobre especificadores exatos pglite
- Task 4: minor (deferred): loop de retry de slug (R12) sem teste
- Task 4: minor (deferred): /sair sem checagem de Origin (logout forçado cross-site, só incômodo)
- Task 4: minor (deferred): SEM RATE LIMIT em login/cadastro (argon2 19 MiB por tentativa) — agendar antes do lançamento público (Ruling R16)
- Task 4: minor (deferred): hash dummy lazy (1º login inexistente 2x mais lento; promise rejeitada fica em cache)
- Task 4: minor (deferred): higiene de sessão (sessão antiga não apagada no novo login; expiradas não podadas; cookie vencido não limpo)
- Task 4: minor (deferred): a11y — aria-pressed + label mutável no olho da senha; role=status dentro do botão
- Task 4: minor (deferred): signup e createSession não atômicos; código morto clearSessionCookie/PRODUCT_NAME
- Task 4: minor (deferred): "recupere a senha" sem link → resolvido na dispatch do T5
- Task 5: minor (deferred): falha de envio já consome cooldown e revoga link anterior (apagar token novo em falha)
- Task 5: minor (deferred): griefing de reset (pedido a cada minuto revoga link da vítima) — mitigado pelo rate limit R16
- Task 5: minor (deferred): emissão derivada de expiresAt-TTL (sem created_at)
- Task 5: minor (deferred): cadastro espera envio inline (usar after())
- Task 5: minor (deferred): sem ZEPTOMAIL_TOKEN em produção loga link real e diz "Enviamos" — falhar alto em produção (levar ao lote de polimento)
- Task 5: minor (deferred): business name com limit(1) em membership; sem teste de consumo concorrente; confirmação em GET (aceito)
- Task 5: minor (deferred): inversão de ordem de lock reserveToken (users→token) vs consume (token→users) → deadlock transitório raro; trocar por pg_advisory_xact_lock(user,purpose) no polimento
- Task 5: minor (deferred): .for("update") poderia ser "no key update"
- Task 7: minor (deferred): cookie pendente vale login por 15 min após uso; usuário apagado entre lookup e lock; dados de tenant do pré-sequestrador ficam na conta; tipo Outcome com sentinela "error"
- Task 8: minor (deferred): bloqueio silencioso de reset por e-mail (logar); "Voltar" nem sempre restaura formulário; legal.ts pode divergir do .md; tentativas bem-sucedidas contam no limite; ref inline do avatar
- Task 8: minor (deferred): doUnmock fora de finally em cookie-names.test; bucket "unknown" compartilhado se proxy mal configurado; despejo por >10 000 chaves

## A verificar após o 1º deploy
- Build Docker no Easypanel (nunca construído antes): corepack/pnpm 12; se falhar, trocar por npm i -g pnpm@12.10.1.
- No container: login real (argon2 musl), /_next/image servindo a logo (sharp), dist/create-super-admin.mjs.
- Logs: aviso único de x-forwarded-for ausente não deve aparecer.
- Manter 1 réplica (migrator sem advisory lock).
- Antes da página pública usar tenants.whatsapp: limpar dados de tenant do pré-sequestrador no vínculo R19.
