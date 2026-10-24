# Sistema visual — Eneven Agendamentos Inteligentes

Autor: Claude (direção de design). Implementadores seguem este documento à risca; qualquer desvio volta para revisão.

## Para quem e para quê

- **Painel:** dono(a) de salão, estúdio de piercing ou estética, quase sempre no **celular**, entre um atendimento e outro, com as mãos ocupadas. Trabalho principal: ver o dia e agir sobre um agendamento em 2 toques.
- **Página pública:** a cliente do salão, no celular, vinda do link no perfil do WhatsApp. Trabalho principal: escolher serviço e horário e confirmar em menos de 1 minuto, sentindo que está no "site do salão".

## O elemento memorável: o fio do tempo

A logo tem um traço que termina num ponto (o "E" ligado ao ponto). Esse **traço com ponto** é a assinatura visual do produto, e o degradê da marca aparece **só nele**:
- **Linha do "agora"** na agenda: fio horizontal no degradê `#3E07D2 → #9429F7 → #F581FB`, com o ponto na ponta esquerda marcando a hora atual.
- **Progresso do agendamento público:** os passos (Serviço → Profissional → Horário → Seus dados) ligados por um fio; o trecho percorrido fica no degradê, o ponto marca o passo atual.
- **Momento de confirmação:** o fio se completa uma única vez (animação de ~600 ms) e vira o check. É a única animação automática do produto; respeita `prefers-reduced-motion`.

Fora disso, **nada de degradê**: sem fundo degradê, sem botão degradê, sem cartões com brilho.

## Cores (tokens)

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--ink` | `#29303C` | `#ECEAF5` | texto principal (cor da logo) |
| `--ink-muted` | `#5E6475` | `#A9A6BD` | texto secundário, rótulos |
| `--canvas` | `#F7F6FC` | `#15131F` | fundo do app (branco levemente lilás, nunca creme) |
| `--surface` | `#FFFFFF` | `#1E1B2C` | painéis, folhas, listas |
| `--line` | `#E6E3F0` | `#2E2A40` | bordas e divisórias (estrutura por linha, não por sombra) |
| `--primary` | `#3E07D2` | `#A673FF` | ações principais, seleção, links |
| `--primary-soft` | `#EEE8FD` | `#2A2245` | fundo de item selecionado / hoje |
| `--accent` | `#9429F7` | `#C08BFF` | foco, destaque secundário |
| `--spark` | `#F581FB` | `#F7A3FC` | só no fio do tempo e no selo "novo" |

Status do agendamento (sempre cor + texto, nunca só cor):

| Status | Cor | Tratamento |
|---|---|---|
| Agendado | `--primary` | contorno 1.5px, fundo `--surface` |
| Confirmado | `#0F9D58` (escuro `#3DD68C`) | barra lateral 3px + texto "Confirmado" |
| Atendido | `--ink-muted` | fundo `--canvas`, texto normal |
| Faltou | `#C2410C` (escuro `#FB923C`) | barra lateral 3px + texto "Faltou" |
| Cancelado | `--ink-muted` | texto riscado, opacidade 60% |

Profissionais ganham uma cor de identificação automática, de uma paleta fixa de 8 tons médios que dão contraste AA com texto branco (`#3E07D2 #0E7C86 #B4237A #2F6FDB #8A5A00 #4C7A12 #A23B3B #5B4BC4`), usada só como ponto/etiqueta.

**Marca do estabelecimento na página pública:** a cor do salão substitui `--primary`. Se a cor escolhida não der contraste AA (4.5:1) com branco, o sistema escurece a cor automaticamente até passar. O fio do tempo continua com o degradê Eneven (é a assinatura discreta da plataforma).

## Tipografia

- **Outfit** (Google Fonts, 500/600/700): títulos, números grandes do dashboard e **horários da agenda**. Geometria arredondada que conversa com a logo.
- **Figtree** (Google Fonts, 400/500/600): todo o texto de interface e formulários.
- Números de horário e dinheiro com `font-variant-numeric: tabular-nums` para alinhar em colunas.
- Escala (rem, base 16px): 0.8125 (legenda) · 0.875 (rótulo) · 1 (corpo) · 1.125 · 1.375 (título de seção) · 1.75 (título de página) · 2.5 (número de destaque).
- Altura de linha: 1.5 corpo, 1.2 títulos. Linhas de texto corrido com no máximo ~70 caracteres.
- Proibido: texto todo em maiúsculas para rótulos, rótulo acima de cada título, destacar uma palavra do título em outra cor.

## Forma e profundidade

- Raio por hierarquia, não igual em tudo: campos e botões **10px**; folhas, diálogos e painéis **16px**; horários e filtros em **pílula** (999px); avatares círculo.
- Estrutura por **bordas finas** (`--line`). Sombra só no que flutua (folha inferior, diálogo, menu): `0 12px 32px -12px rgb(41 48 60 / 0.28)`.
- Toque mínimo de **44×44px**; espaçamento em múltiplos de 4 (4, 8, 12, 16, 24, 32, 48).
- Foco visível em tudo: anel 2px `--accent` com 2px de afastamento.

## Layout do painel

**Celular (principal):**
```
┌──────────────────────────────┐
│ Studio Defendi        (sino) │  topo: nome do estabelecimento
│ ‹  Seg 26 · Ter 27 · Qua 28 › │  faixa da semana com pontos de ocupação
├──────────────────────────────┤
│ 09:00 ● Ana Souza            │  lista do dia, linha por agendamento:
│       Piercing hélix · Bia   │  hora (Outfit) | cliente | serviço · profissional
│ 10:30 ● Carla Lima  Confirm. │  barra lateral de status
│ ─●━━━━━━━━━━━━━━━━━━━━━━━━━━ │  fio do "agora" (degradê)
│ 14:00 ● …                    │
│                         ( + )│  botão flutuante "Novo agendamento"
├──────────────────────────────┤
│ Agenda  Clientes  Painel  Mais│  navegação inferior (4 itens)
└──────────────────────────────┘
```
Tocar num agendamento abre uma **folha inferior** com: cliente (telefone com botão WhatsApp), serviço, horário, status, e as ações **Confirmar · Remarcar · Atendido · Faltou · Cancelar**. Remarcar abre o mesmo seletor de horários da página pública.

**Computador / tablet (≥ 1024px):**
```
┌────────┬─────────────────────────────────┬──────────────────────┐
│ logo   │  Outubro 2026          ‹  hoje › │ Terça, 27 de outubro │
│        │  S   T   Q   Q   S   S   D       │ 8 agendamentos · R$ 640 │
│ Agenda │  ┌───┬───┬───┬───┬───┬───┬───┐   │ ─────────────────────│
│ Client.│  │ 1 │ 2 │ 3 │...            │   │ 09:00  Ana Souza     │
│ Serviç.│  │▮▮▯│   │                   │   │        Hélix · Bia   │
│ Equipe │  ├───┼───┼───                │   │ 10:30  Carla Lima ✓  │
│ Painel │  │27 │  ← dia selecionado    │   │ ─●━━━━━━━━━━━━━━━━━━ │
│ Config.│  │   │    (fundo primary-soft)│   │ 14:00  …             │
│        │  └───┴───┴───                 │   │                      │
│ conta  │  Filtro: [Todos] [Bia] [Léo]  │   │ [+ Novo agendamento] │
└────────┴─────────────────────────────────┴──────────────────────┘
```
- Barra lateral estreita (232px) com navegação; mês (30 dias) ao centro; **lista do dia selecionado na coluna da direita** (pedido do Ricardo, 360px).
- Cada dia do mês mostra o número e uma **barra de ocupação** (proporção do expediente já agendado) — não blocos de eventos espremidos. Visões de dia e semana por profissional ficam em abas acima do calendário.
- Conteúdo alinhado à esquerda; nada centralizado no painel, exceto estados vazios.

## Página pública de agendamento

```
┌──────────────────────────────┐
│ (logo) Studio Defendi        │  cabeçalho com marca do salão
│ Rua X, 120 · Aberto até 19h  │
│ ●━━━━○────○────○             │  fio de progresso (4 passos)
│ Escolha o serviço            │
│ ──────────────────────────── │
│ Piercing hélix               │  serviços em LISTA (nome, duração, preço)
│ 30 min               R$ 90   │  não em cartões
│ ──────────────────────────── │
│ Anodização           R$ 40   │
│ ...                          │
├──────────────────────────────┤
│ 1 serviço · 30 min · R$ 90   │  barra fixa inferior com resumo
│ [        Continuar         ] │
└──────────────────────────────┘
```
- Horários agrupados em **Manhã / Tarde / Noite**, como pílulas em grade; data numa faixa horizontal de dias.
- "Seus dados": só nome e WhatsApp (e-mail opcional), teclado numérico no telefone, máscara `(11) 99999-9999`.
- Confirmação: resumo, "Adicionar ao calendário", "Gerenciar agendamento" e o momento do fio se completando.

## Telas de entrada (cadastro e login)

Celular: uma coluna, logo no topo, formulário direto. Computador: duas colunas — à esquerda o formulário (480px), à direita um painel `--primary` sólido com uma **prévia real** de uma agenda do dia desenhada com os componentes do produto (com o fio do "agora"), em vez de ilustração ou frase de efeito.

## Texto da interface

- Português do Brasil, frases em caixa normal, verbos diretos: "Agendar", "Remarcar", "Confirmar presença", "Salvar alterações".
- A mesma ação tem o mesmo nome do botão até a mensagem de sucesso ("Remarcar" → "Agendamento remarcado").
- Erros dizem o que houve e como resolver, sem pedir desculpas: "Esse horário acabou de ser reservado. Escolha outro."
- Estados vazios convidam a agir: "Nenhum agendamento hoje. Compartilhe seu link para receber reservas." + botão "Copiar link".
- Sem "→" em botões, sem rótulos em maiúsculas, sem separar metadados com "·" em excesso (máx. 2 itens por linha).

## Qualidade mínima (sempre)

Responsivo de 360px até desktop · contraste AA · foco visível · `prefers-reduced-motion` · alvos de toque 44px · tema escuro completo · carregamento rápido (fontes com `display: swap`, sem bibliotecas de animação).
