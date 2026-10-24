# Telas de entrada: cadastro, login e painel inicial

Segue `docs/design/sistema-visual.md`. Tudo aqui é obrigatório; o que não estiver escrito segue o sistema visual.

## Fundação visual (aplicar em `src/app/globals.css` e `layout.tsx`)

- Fontes via `next/font/google`: **Outfit** (500, 600, 700) como `--font-display` e **Figtree** (400, 500, 600) como `--font-sans`, `display: "swap"`, subset `latin`. Remover Geist.
- Tokens CSS exatamente como a tabela de cores do sistema visual (`--ink`, `--ink-muted`, `--canvas`, `--surface`, `--line`, `--primary`, `--primary-soft`, `--accent`, `--spark`, status), mapeados para os nomes do shadcn (`--background: var(--canvas)`, `--foreground: var(--ink)`, `--card: var(--surface)`, `--border`/`--input: var(--line)`, `--ring: var(--accent)`, `--muted-foreground: var(--ink-muted)`, `--primary`, `--primary-foreground: #FFFFFF`).
- Tema escuro: seguir `prefers-color-scheme` automaticamente (sem botão por enquanto) **e** manter a classe `.dark` funcionando com os mesmos valores.
- Raios: `--radius-field: 10px` (inputs, botões), `--radius-panel: 16px` (cards/folhas), pílula 999px.
- Utilitário `.fio` (fio do tempo): linha de 3px de altura, `border-radius: 999px`, fundo `linear-gradient(90deg, #3E07D2, #9429F7, #F581FB)`, com pseudo-elemento ponto de 10px `#3E07D2` (no escuro `#A673FF`) na ponta esquerda, centralizado verticalmente.
- Foco: `outline: 2px solid var(--accent); outline-offset: 2px` em todos os interativos.

## Componente `AgendaPreview` (`src/components/brand/agenda-preview.tsx`)

Prévia estática e decorativa (`aria-hidden="true"`) de um dia de agenda, desenhada com o mesmo estilo que a agenda real terá. Usada no painel direito das telas de entrada.

```
Terça, 27 de outubro
8 agendamentos

09:00  Ana Souza
       Piercing hélix · Bia              [Confirmado]
10:30  Carla Lima
       Corte e escova · Léo
●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  (fio do agora)
14:00  Juliana Reis
       Design de sobrancelha · Bia
15:30  Marina Costa
       Anodização · Léo                  [Agendado]
```
- Fundo `--surface`, raio 16px, borda `--line`, sombra de elemento flutuante (`0 12px 32px -12px rgb(41 48 60 / 0.28)`), largura máx. 400px, leve rotação de `-2deg` só no desktop.
- Horários em Outfit 600 com `tabular-nums`; nome em Figtree 600; linha de serviço em `--ink-muted` 0.875rem.
- Status: "Confirmado" com barra lateral 3px verde `#0F9D58` no item; "Agendado" com contorno `--primary`. Os outros sem selo.
- Cada profissional com ponto de cor (Bia `#B4237A`, Léo `#0E7C86`) antes do nome dele.
- O fio do agora usa a utilidade `.fio` entre o 2º e o 3º item.

## Layout das telas `/cadastro` e `/entrar`

**≥ 1024px:** grid de duas colunas `minmax(0, 1fr) minmax(0, 1fr)`, altura mínima 100dvh.
- Coluna esquerda (fundo `--canvas`): conteúdo alinhado à esquerda, largura máx. 420px, centralizado verticalmente, padding 48px. Logo horizontal (`/brand/logo.png`) com 168px de largura no topo da coluna (link para `/`).
- Coluna direita: fundo `--primary` **sólido** (#3E07D2; no escuro `#2A2245`), `AgendaPreview` centralizada, e abaixo dela uma frase curta em branco 90%, Figtree 500 1.125rem, máx. 32ch:
  - cadastro: "Seus clientes agendam sozinhos pelo link. Você só acompanha o dia."
  - login: "Sua agenda do dia, onde você estiver."

**< 1024px:** uma coluna só, sem o painel direito; logo 140px no topo; padding 24px lateral; formulário ocupa a largura.

### Cadastro (`/cadastro`)
- Título (Outfit 600, 1.75rem): "Crie sua agenda online"
- Subtítulo (`--ink-muted`): "14 dias grátis. Sem cartão de crédito."
- Campos, nesta ordem, cada um com `<Label>` visível:
  1. "Nome do estabelecimento" — placeholder "Ex.: Studio Defendi"
  2. "Seu nome"
  3. "WhatsApp" — `inputMode="tel"`, máscara `(11) 99999-9999`, placeholder "(11) 99999-9999"
  4. "E-mail" — `type="email"`, `autoComplete="email"`
  5. "Senha" — `type="password"`, `autoComplete="new-password"`, ajuda abaixo "Mínimo de 8 caracteres", botão de olho para mostrar/ocultar (ícone lucide `Eye`/`EyeOff`, `aria-label` "Mostrar senha"/"Ocultar senha")
- Abaixo do campo "Nome do estabelecimento", ao digitar, prévia do link em `--ink-muted` 0.8125rem: "Seu link: agenda.eneven.com.br/**studio-defendi**" (slug calculado no cliente com a mesma regra do servidor; o definitivo vem do servidor).
- Botão principal largura total, altura 48px: "Criar minha agenda"; durante o envio: "Criando sua agenda…" com spinner e desabilitado.
- Texto legal 0.8125rem: "Ao criar sua conta você concorda com os Termos de uso e a Política de privacidade." (links para `/termos` e `/privacidade`, mesmo que ainda não existam).
- Rodapé: "Já tem conta? Entrar" (link `/entrar`).

### Login (`/entrar`)
- Título: "Entrar na sua agenda"
- Campos: "E-mail", "Senha" (com olho; `autoComplete="current-password"`), link à direita do rótulo da senha: "Esqueci minha senha" → `/recuperar-senha`.
- Botão: "Entrar" / "Entrando…".
- Rodapé: "Ainda não tem conta? Criar agenda grátis" → `/cadastro`.

### Erros
- Erro de campo: texto 0.8125rem em `#C2410C` (escuro `#FB923C`) abaixo do campo, campo com borda da mesma cor e `aria-invalid`, `aria-describedby`.
- Erro geral (ex.: login inválido): faixa no topo do formulário, fundo `#FFF4ED` (escuro `#3A2418`), borda esquerda 3px `#C2410C`, texto: "E-mail ou senha incorretos." — nunca dizer qual dos dois está errado.
- Mensagens de validação: "Informe o nome do estabelecimento.", "Informe seu nome.", "Informe um WhatsApp com DDD.", "Informe um e-mail válido.", "A senha precisa ter pelo menos 8 caracteres.", "Este e-mail já tem uma conta. Entre ou recupere a senha." (com link "Entrar").

## Painel inicial (`/painel`) — provisório até o Plano 2

Estrutura já com a casca definitiva do painel:
- **≥ 1024px:** barra lateral fixa 232px (fundo `--surface`, borda direita `--line`): logo 132px no topo; navegação com ícones lucide e rótulos: Agenda (`CalendarDays`), Clientes (`Users`), Serviços (`Scissors`), Equipe (`UserRound`), Painel (`ChartNoAxesColumn`), Configurações (`Settings`). Item ativo: fundo `--primary-soft`, texto `--primary`, peso 600. Itens ainda não construídos ficam visíveis mas desabilitados com `title="Em breve"`. No rodapé da barra: nome do usuário, nome do estabelecimento e "Sair".
- **< 1024px:** topo com o nome do estabelecimento (Outfit 600) e navegação inferior fixa com 4 itens: Agenda, Clientes, Painel, Mais (os desabilitados com opacidade 50%).
- Conteúdo (Agenda vazia):
  - Faixa de aviso do teste no topo do conteúdo: "Seu teste grátis termina em **N dias** (dd/mm)." em `--primary-soft` com texto `--primary`.
  - Se o e-mail não foi confirmado: faixa acima dela em `#FFF4ED`/borda `#C2410C`: "Confirme seu e-mail para liberar seu link de agendamento. Enviamos para **email**." + botão secundário "Reenviar e-mail" (ação implementada no Task 5; no Task 4 o botão pode existir desabilitado).
  - Saudação: "Olá, {primeiro nome}" (Outfit 600 1.75rem) e abaixo o nome do estabelecimento.
  - Estado vazio centralizado na área: um `.fio` de 160px, texto "Sua agenda está pronta para receber agendamentos." e "Em breve: serviços, equipe e seu link de agendamento." em `--ink-muted`.
- Título da aba: "Agenda · Eneven Agenda".
