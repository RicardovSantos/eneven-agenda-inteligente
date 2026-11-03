# Landing page Eneven Agenda

URL: https://conheca-agenda.eneven.com.br/

Página estática independente do Next.js, servida pelo Cloudflare Worker `eneven-agenda-landing`. Fonte integral em `worker.mjs`. Não altera rotas, autenticação, banco ou deploy do aplicativo.

## Conteúdo

Copy para salões, prévia ilustrativa interativa, links às demonstrações reais `/demo` e `/demo/painel`, cadastro com 14 dias grátis sem cartão, recursos verificados no README do produto e calculadora de estimativa de tempo. Os dados da prévia são fictícios. Preços de assinatura não foram inventados; WhatsApp é descrito como condicionado à configuração.

## Publicação

Publicar `worker.mjs` como Worker ES module, com data de compatibilidade 2026-11-01. Rota Cloudflare: `conheca-agenda.eneven.com.br/*`. DNS: AAAA `conheca-agenda` → `100::`, com proxy, porque o Worker atende a rota sem servidor de origem. O DNS de `agenda.eneven.com.br` não foi alterado.

A página não recebe formulários nem usa analytics, cookies ou dados de clientes. Usa Google Fonts (Sora e Inter) com fallback de sistema. Links de cadastro e demonstração apontam para o aplicativo existente. Inclui robots.txt, sitemap.xml, metadados e cabeçalhos de segurança.

## Validação

Publicação HTTPS confirmada com resposta 200 e conteúdo renderizado. Sintaxe do Worker validada com `node --check`. Layout definido por media queries, alvos de toque, foco visível, navegação de abas por teclado e suporte a movimento reduzido. Revisão visual em múltiplos dispositivos ainda necessária.
