# Telas do Plano 2 — núcleo da agenda

Segue `docs/design/sistema-visual.md`. **Os mockups aprovados pelo Ricardo em `docs/design/plano-2/*.dc.html` são a fonte de verdade visual** das telas que cobrem: cores, tamanhos, espaçamentos, textos e hierarquia devem ser reproduzidos (os estilos estão inline nos arquivos; os dados de exemplo — Studio Defendi, serviços, preços, nomes — são só exemplo). As telas abaixo não têm mockup e seguem o mesmo padrão.

| Mockup | Tela real |
|---|---|
| `Main.dc.html` | `/painel` (agenda, ≥1024px) |
| `AgendaCelular.dc.html` | `/painel` (<1024px) |
| `Detalhe.dc.html` | detalhe do agendamento (folha inferior no celular; painel lateral/diálogo no computador) |
| `Servicos.dc.html` | `/painel/servicos` |
| `PublicaServico.dc.html` | `/{slug}` passo 1 |
| `PublicaHorario.dc.html` | `/{slug}` passo 3 |
| `PublicaConfirmado.dc.html` | `/{slug}` confirmação |

## Regras gerais

- Casca do painel (menu lateral/inferior) já existe (`src/components/panel/`); os itens Agenda, Serviços, Equipe e Configurações passam a ficar habilitados. Clientes e Painel continuam "Em breve" (Plano 3).
- No menu lateral, abaixo dos itens, o bloco "Seu link de agendamento" com o link e botão de copiar (mockup `Main`). Só aparece com o link liberado (e-mail confirmado e conta ativa/em teste); senão mostra "Confirme seu e-mail para liberar seu link".
- Estados vazios convidam a agir (ex.: agenda sem agendamentos: "Nenhum agendamento neste dia. Compartilhe seu link para receber reservas." + "Copiar link").
- Toda ação que muda dados mostra confirmação discreta (toast no rodapé, 4 s): "Agendamento confirmado", "Agendamento remarcado", "Serviço salvo"… — mesmo verbo do botão.
- Ações destrutivas (cancelar agendamento, excluir profissional) pedem confirmação num diálogo: título com a pergunta, texto com a consequência, botões "Voltar" e a ação em `#C2410C`.
- Moeda sempre `R$ 1.234,50`; durações "30 min" / "1 h 15 min"; datas "Terça, 27 de outubro"; horários "14:30".

## Página pública — passo 2: Profissional

Mesmo cabeçalho do passo 3 (voltar + marca do salão + fio de progresso com "Profissional" atual). Título "Com quem você quer agendar?", subtítulo com o(s) serviço(s) escolhido(s). Lista (mesmo estilo da lista de serviços, linhas de 68px) com: primeira opção "Qualquer profissional disponível" (ícone de pessoas em círculo `--primary-soft`), depois cada profissional que faz TODOS os serviços escolhidos, com bolinha da cor dele e nome. Seleção por rádio com `accent-color` da marca. Se só um profissional atende, o passo é pulado automaticamente.

## Página pública — passo 4: Seus dados

Título "Seus dados". Resumo compacto no topo (serviço · dia · hora · profissional) num bloco `--canvas` raio 16px, com link "Alterar". Campos: "Seu nome", "WhatsApp" (máscara `(11) 99999-9999`, `inputMode="tel"`), "E-mail" (opcional). Checkbox obrigatório: "Concordo com o uso dos meus dados para este agendamento, conforme a Política de privacidade" (link). Botão "Confirmar agendamento" (cor da marca). Erro de horário tomado: faixa de erro "Esse horário acabou de ser reservado. Escolha outro." + volta ao passo 3 mantendo os dados.

## Página pública — indisponível

Quando o estabelecimento não pode receber agendamentos (e-mail não confirmado, teste vencido/somente leitura/cancelado, ou sem serviço ativo/profissional): cabeçalho com a marca, texto "Agendamento online indisponível no momento." e botão "Falar com {nome} no WhatsApp" (se houver WhatsApp). Slug inexistente: página 404 com a marca Eneven e "Não encontramos esse estabelecimento."

## Gerenciar agendamento (`/agendamento/{token}`)

Mesmo visual da confirmação (marca do salão). Mostra o resumo e o status. Ações: "Adicionar ao calendário", "Remarcar" (abre o seletor de dia/horário do passo 3), "Cancelar agendamento" (diálogo de confirmação). Fora da janela permitida: texto "Para remarcar ou cancelar, fale com {nome}." + botão WhatsApp. Cancelado: "Este agendamento foi cancelado." + "Agendar de novo" (link para `/{slug}`).

## Novo agendamento (painel)

Computador: diálogo de 560px; celular: tela cheia com voltar. Campos em ordem: Cliente (busca por nome ou WhatsApp com resultados abaixo; "+ Novo cliente" abre nome + WhatsApp inline), Serviço(s) (chips selecionáveis), Profissional (select; padrão o filtro atual), Dia e horário (mesmo seletor de pílulas do passo 3, mostrando só horários livres; opção "Encaixar fora dos horários" que libera digitar a hora — ainda respeitando conflito), Observação (opcional). Botão "Agendar".

## Bloqueios (folga, almoço, férias)

Na agenda, botão secundário "Bloquear horário" ao lado de "Novo agendamento". Diálogo: Profissional (ou "Todo o estabelecimento"), De (data e hora), Até (data e hora), Motivo (opcional). Na lista do dia, bloqueios aparecem como linha cinza listrada "Bloqueado · {motivo}" com opção de remover.

## Equipe (`/painel/equipe`)

Layout igual a `Servicos.dc.html`: tabela à esquerda (Profissional com bolinha de cor, Serviços que faz — chips, Horário resumido "Seg a Sex 9h–18h", Status "Ativo"/"Inativo") e painel de edição à direita: Nome; Cor (8 bolinhas da paleta de profissionais do sistema visual); Serviços que faz (checkboxes); Horário de trabalho — uma linha por dia da semana com interruptor "Trabalha" e intervalos de/até (time inputs) com "+ intervalo" (ex.: 09:00–12:00 e 13:00–18:00); "Copiar segunda para todos os dias úteis"; Ativo. Botões "Salvar alterações" / "Cancelar". O expediente do profissional nunca pode sair do horário de funcionamento (aviso inline se sair).

## Configurações (`/painel/configuracoes`)

Uma coluna de 720px com seções em cartões (`--surface`, borda, raio 16): **Seu estabelecimento** (nome, WhatsApp, endereço, Instagram, sobre — 160 caracteres); **Marca** (logo: área de envio com prévia circular 72px, "Trocar logo"/"Remover"; cor: 8 sugestões + campo hex; prévia ao vivo do botão "Continuar" e do cabeçalho da página pública com a cor ajustada; aviso "Ajustamos a cor para manter a leitura" quando escurecida); **Horário de funcionamento** (mesmo editor de dias/intervalos da Equipe); **Regras de agendamento** (Intervalo entre horários: 10/15/20/30 min; Antecedência mínima: 30 min/1 h/2 h/4 h/1 dia; Agendar até: 15/30/60/90 dias à frente; Cliente pode cancelar ou remarcar até: 1 h/2 h/12 h/24 h antes); **Seu link** (slug editável com prévia `agenda.eneven.com.br/…` e verificação de disponibilidade). Cada seção com seu botão "Salvar".

## Primeiros passos (`/painel/comecar`)

Mostrado no primeiro acesso até concluir (o painel redireciona para cá enquanto `onboardingCompletedAt` for nulo; dá para pular com "Fazer depois", que marca concluído). Layout centralizado 640px com o **fio de progresso** (mesmo componente da página pública) com 4 etapas: **Seu estabelecimento** (logo, cor, WhatsApp, endereço) → **Horário** (funcionamento) → **Serviços** (adicionar pelo menos 1: nome, duração, preço; lista dos adicionados) → **Equipe** (pré-preenchido com o dono como profissional; adicionar mais; todos fazem todos os serviços por padrão). Final: tela "Sua agenda está pronta" com o fio completando em check (mesma animação da confirmação pública), o link grande com "Copiar link", botão "Abrir minha página" e o texto sugerido para o perfil do WhatsApp: "Agende seu horário online: agenda.eneven.com.br/{slug}" com "Copiar texto".
