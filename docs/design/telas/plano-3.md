# Telas do Plano 3 — clientes, visão geral, acessos da equipe e plataforma

Segue `docs/design/sistema-visual.md` e as regras gerais de `docs/design/telas/plano-2.md` (toasts, diálogos destrutivos, formatos de moeda/data). **Os mockups aprovados pelo Ricardo em `docs/design/plano-3/*.dc.html` são a fonte de verdade visual** das telas que cobrem (os dados são só exemplo). As telas abaixo não têm mockup e seguem o mesmo padrão.

| Mockup | Tela real |
|---|---|
| `Main.dc.html` | `/painel/visao-geral` (≥1024px) |
| `PainelCelular.dc.html` | `/painel/visao-geral` (<1024px) |
| `Clientes.dc.html` | `/painel/clientes` e `/painel/clientes/{id}` (≥1024px: lista + ficha ao lado) |
| `ClientesCelular.dc.html` | `/painel/clientes` (<1024px) |
| `ClienteCelular.dc.html` | `/painel/clientes/{id}` (<1024px: só a ficha) |
| `Admin.dc.html` | `/admin` |
| `AdminDetalhe.dc.html` | `/admin/estabelecimentos/{id}` |

## Menu do painel por papel

- **Proprietário:** Agenda, Clientes, Serviços, Equipe, Painel, Configurações (todos habilitados; some o "Em breve").
- **Recepção:** Agenda, Clientes, Serviços e Equipe (só leitura, como já é hoje).
- **Profissional:** Agenda e Clientes.
- Super-admin com estabelecimento próprio: item extra "Plataforma" no fim do menu lateral e na tela Mais.
- Página fora do papel redireciona para `/painel`.

## Visão geral — detalhes que o mockup não mostra

- Mês vazio (sem agendamentos): os números aparecem zerados e, no lugar do gráfico, o texto "Ainda não há agendamentos neste mês." com o botão "Copiar link".
- Comparação com o mês anterior só aparece quando o mês anterior teve faturamento. A cor é verde com seta para cima quando cresce e `--ink-muted` com seta para baixo quando cai (nunca vermelho).
- "Revisar agora" abre um diálogo (folha inferior no celular) "Atendimentos sem resultado" com uma linha por atendimento: data e hora, cliente, serviço, e os botões "Atendido" e "Faltou". Cada toque some com a linha e mostra o toast "Marcado como atendido" ou "Marcado como falta". A lista vazia fecha o diálogo e o aviso some.
- Gráfico com hover/toque: tooltip com "Terça, 13 de outubro · 3 agendamentos".

## Clientes — detalhes

- Lista vazia: "Seus clientes aparecem aqui assim que agendarem pelo link." + "Copiar link".
- Busca sem resultado: "Nenhum cliente encontrado para “{busca}”."
- 50 por vez, com o botão "Carregar mais" no fim.
- **Novo cliente** (diálogo 480px; tela cheia no celular): Nome, WhatsApp (máscara), E-mail (opcional), Observações (opcional). Botão "Salvar cliente" → toast "Cliente salvo". WhatsApp repetido: erro no campo "Já existe um cliente com esse WhatsApp." com o link "Abrir cadastro".
- **Editar dados**: o mesmo diálogo, preenchido, com o botão "Salvar alterações".
- **Observações**: salvam ao sair do campo; toast "Observações salvas".
- **Agendar**: abre o "Novo agendamento" já existente com o cliente escolhido.
- **Profissional (papel)**: vê só os clientes que atendeu, sem "Total gasto", e o histórico só com os próprios atendimentos.

## Acessos da equipe (`/painel/configuracoes`, novo cartão)

Cartão "Acessos da equipe", depois de "Seu link":
- Lista: nome, e-mail, papel ("Proprietário", "Recepção", "Profissional · {nome do profissional}") e situação ("Ativo" ou "Convite enviado").
- Ações por linha: "Reenviar convite" e "Cancelar convite" (convite pendente); "Remover acesso" (membro, com diálogo destrutivo "Remover o acesso de {nome}?" / "{nome} não vai mais conseguir entrar no painel deste estabelecimento."). O proprietário não tem ações.
- Botão "Convidar pessoa" abre um diálogo com: Nome, E-mail, Papel (rádio "Recepção: vê e mexe na agenda e nos clientes" / "Profissional: vê só a própria agenda") e, para Profissional, um select "Qual profissional da equipe" (só profissionais ativos e ainda sem acesso). Botão "Enviar convite" → toast "Convite enviado".

## Aceitar convite (`/convite/{token}`)

Mesmo layout das telas de entrada (`docs/design/telas/entrada.md`). Título "{Estabelecimento} convidou você", texto "Você vai acessar a agenda como Recepção." (ou "como Profissional").
- E-mail sem conta: Nome (preenchido), Senha, botão "Criar acesso", e abaixo "Continuar com Google".
- E-mail que já tem conta: "Entre com {e-mail} para aceitar." + botões "Entrar" e "Continuar com Google". Depois de entrar, o convite é aceito automaticamente.
- Convite vencido/cancelado/usado: "Este convite não vale mais. Peça um novo a quem convidou você."
- Convite de proprietário (enviado pela plataforma): título "Sua agenda está pronta", texto "Crie sua senha para entrar no painel de {Estabelecimento}."

## Somente leitura (painel)

Quando o estabelecimento não está ativo (teste vencido, bloqueado, cancelado ou com pagamento atrasado): faixa fixa no topo do conteúdo, fundo `#FFF1E8`, texto `#9A3412`: "Sua agenda está em modo somente leitura: a página de agendamento está fora do ar e não dá para marcar novos horários." Se houver WhatsApp de suporte configurado, botão "Falar com a Eneven". "Novo agendamento", "Remarcar" e o envio de bloqueios ficam desabilitados.

## Modo suporte (super-admin "entrou como")

Faixa fixa no topo de todo o painel, fundo `--ink`, texto branco: "Você está vendo como **{Estabelecimento}** (suporte)." + botão contornado branco "Voltar à plataforma".

## Plataforma — telas sem mockup

- **Novo estabelecimento** (`/admin/estabelecimentos/novo`), uma coluna de 640px: Nome do estabelecimento, Nome do dono, E-mail do dono, WhatsApp, Plano (select), Dias de teste (14 por padrão). Botão "Criar estabelecimento" → leva ao detalhe, com toast "Estabelecimento criado". No detalhe, o cartão "Dono" ganha o botão "Enviar acesso por e-mail" enquanto o dono não tiver criado a senha (texto ao lado: "Convite enviado em 27/10" depois de enviado).
- **Planos** (`/admin/planos`): layout igual a `Servicos.dc.html` do Plano 2, com tabela (Plano, Preço, Profissionais, Mensagens/mês, Estabelecimentos usando, Ativo) e painel de edição (Nome, Preço, Até quantos profissionais — vazio = ilimitado, Mensagens por mês, Ativo).
- **Bloquear** e **Cancelar conta** pedem confirmação em diálogo destrutivo. Cancelar fica num menu "Mais ações" no cartão Assinatura.
