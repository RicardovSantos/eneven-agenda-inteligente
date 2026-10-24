# Eneven Agenda Inteligente — Documento de projeto

Data: 24-10-2026 · Dono do produto: Ricardo (Eneven Tech) · Status: aprovado pelo Ricardo em 24-10-2026

Itens marcados com **[decisão do Claude]** não foram discutidos com o Ricardo; são escolhas padrão que ele pode trocar. Todo o resto foi decidido por ele na conversa.

## 1. Intenção e porquê

A Eneven Tech vende landing pages para pequenos negócios que trabalham com hora marcada (salões de beleza, estúdios de piercing, estética). Ricardo quer um segundo produto para esses mesmos clientes: um **SaaS de agendamento multiempresa**, barato, que ele vende por assinatura e que cada estabelecimento configura sozinho, sem código novo por cliente.

O que o estabelecimento ganha:
- um **link público próprio** (colocado no perfil do WhatsApp, na bio do Instagram, no Google e no botão da landing page) onde o cliente final agenda sozinho;
- um **painel** com agenda, clientes, faturamento e indicadores;
- **lembretes automáticos no WhatsApp** que reduzem faltas.

Contexto comercial: empresa no começo, precisa ganhar clientes rápido, e o público não paga caro. O plano de entrada fica em torno de R$ 40/mês. A prospecção é feita pelo Ricardo por fora; o produto só precisa ter o cadastro self-service e o cadastro pelo painel dele.

Este produto substitui, como SaaS principal, o Eneven Prospect (que será desativado no futuro). É um produto separado do Eneven Hub: código, banco e dados próprios.

Vocabulário (evitar confusão em todo o código e na interface):
- **Estabelecimento / salão (tenant):** o cliente pagante do SaaS.
- **Cliente:** a pessoa que agenda no estabelecimento. Nunca chamar o estabelecimento de "cliente" na interface do estabelecimento.
- **Plataforma / super-admin:** o Ricardo.

## 2. Objetivos

1. Um estabelecimento novo sai do cadastro com o link de agendamento funcionando em menos de 15 minutos.
2. O cliente final agenda pelo celular em menos de 1 minuto, sem criar conta.
3. Nunca existe dupla reserva para o mesmo profissional, nem com dois clientes clicando ao mesmo tempo.
4. Os dados de um estabelecimento nunca aparecem para outro.
5. A aparência é de software profissional, no nível dos SaaS conhecidos do mercado: é com isso que o Ricardo vende.
6. Ricardo administra todos os estabelecimentos, planos e cobranças num painel próprio.

## 3. Não objetivos (fora desta versão)

- Pagamento antecipado / sinal por Pix (fase seguinte; necessário para tatuagem).
- Fluxo de tatuagem com orçamento, sessões sem duração fixa, anamnese ou termo de consentimento.
- Envio pelo número de WhatsApp do próprio estabelecimento (fase com CNPJ, ver §8).
- IA / conversa em linguagem natural.
- Múltiplas unidades (filiais) por estabelecimento.
- App nativo (o painel é PWA instalável).
- Emissão de nota fiscal, comissão de profissionais, controle de estoque, campanhas de marketing.

## 4. Anti-objetivos (fracasso mesmo funcionando)

- Dupla reserva ou horário "fantasma" oferecido ao cliente.
- Vazamento de dados entre estabelecimentos (inclusive por URL pública, job ou API).
- Visual amador, telas inconsistentes ou fluxos que precisam de explicação.
- Usar WhatsApp não oficial (Evolution etc.) como base do produto, ou colocar em risco o número de um estabelecimento.
- Mandar conteúdo promocional pelos templates de utilidade (risco de a Meta reclassificar/bloquear).
- Custo de mensagens fora de controle (sem franquia, sem medição).

## 5. Usuários e papéis

| Papel | Quem | Pode |
|---|---|---|
| Super-admin | Ricardo | Tudo na plataforma: estabelecimentos, planos, assinaturas, bloqueio, "entrar como" o estabelecimento para suporte, métricas da plataforma |
| Dono | Dono do estabelecimento | Tudo dentro do estabelecimento, incluindo assinatura, usuários e configurações |
| Recepção | Funcionário | Agenda e clientes de todos os profissionais; sem faturamento, assinatura ou configurações **[decisão do Claude]** |
| Profissional | Quem atende | Só a própria agenda e os clientes que atendeu; sem faturamento geral **[decisão do Claude]** |
| Cliente | Público | Agenda pelo link, sem conta; gerencia o próprio agendamento por um link único |

O "entrar como" do super-admin fica registrado em log de auditoria.

## 6. Entrada do estabelecimento (decidido)

Duas entradas, mesmo resultado:
1. **Cadastro self-service** numa página pública (Ricardo divulga o link). Cria a conta com **14 dias de teste grátis**.
2. **Cadastro pelo painel do Ricardo**, para quem ele fecha na prospecção. Ele pode pré-configurar serviços e marca e enviar o acesso. Isso também serve para montar uma demonstração com a cara do estabelecimento antes de fechar a venda.

Primeiro acesso → **assistente de configuração** em passos: dados e logo/cor, horário de funcionamento, serviços (nome, duração, preço), profissionais (e quais serviços cada um faz). No fim aparece o link pronto para copiar e um texto sugerido para colocar no perfil do WhatsApp.

O teste começa **sem pedir cartão** **[decisão do Claude]**; o cadastro self-service confirma o e-mail do dono antes de liberar a página pública.

Teste: 14 dias, franquia de lembretes reduzida (**50 mensagens [decisão do Claude]**). Ao fim do teste sem assinatura: **modo somente leitura** (vê a agenda, não recebe agendamentos novos; a página pública mostra "agendamento indisponível, fale com o estabelecimento" com botão do WhatsApp). Dados preservados por **90 dias [decisão do Claude]**, depois anonimização/exclusão com aviso prévio.

## 7. Funcionalidades do MVP

### 7.1 Página pública de agendamento (`agenda.eneven.com.br/{slug}`)
- Mobile-first, com logo, cor, nome, endereço, WhatsApp e Instagram do estabelecimento.
- Fluxo: **serviço(s) → profissional (ou "qualquer disponível") → data → horário livre → nome + telefone (e-mail opcional) → confirmar.**
- O cliente pode escolher **mais de um serviço** no mesmo atendimento, com o mesmo profissional; as durações somam **[decisão do Claude]**.
- Só aparecem horários realmente livres, considerando o horário do estabelecimento, o expediente do profissional, os bloqueios, os agendamentos existentes, o intervalo entre atendimentos, a antecedência mínima e o limite de dias à frente.
- Aceite de privacidade (LGPD) antes de confirmar.
- Tela de sucesso com resumo, botão "adicionar ao calendário" (arquivo .ics / Google) e o link de gerenciamento.
- **Link de gerenciamento** (token único, sem login): ver, confirmar presença, remarcar e cancelar dentro das regras do estabelecimento.
- Cliente identificado por **telefone normalizado** dentro do estabelecimento: se já existe, o agendamento vai para o mesmo cadastro.
- Proteção contra abuso: limite de tentativas por IP/telefone e captcha invisível se houver abuso **[decisão do Claude]**.

### 7.2 Painel do estabelecimento
- **Agenda** (tela principal): calendário do mês (30 dias) com a **lista de agendamentos na coluna ao lado** (pedido do Ricardo); também visões de dia e semana por profissional; filtro por profissional. Clicar num agendamento abre o detalhe com ações: confirmar, remarcar, cancelar, marcar como atendido ou faltou, abrir conversa no WhatsApp do estabelecimento.
- **Remarcar** pelo painel avisa o cliente automaticamente no WhatsApp com o novo horário (conta na franquia).
- **Novo agendamento manual** (recepção marca por telefone/balcão), com a mesma validação de disponibilidade.
- **Bloqueios:** folga, almoço, férias, feriado; por profissional ou para o estabelecimento todo.
- **Clientes:** lista com busca, cadastro manual (para clientes antigos), histórico de atendimentos, total gasto, faltas, observações.
- **Serviços:** nome, descrição, duração, preço, ativo/inativo, quais profissionais fazem.
- **Profissionais:** nome, foto, expediente semanal, serviços, se tem login.
- **Dashboard:**
  - agendamentos do mês passado e do mês atual;
  - agendamentos futuros (hoje até +30 dias);
  - faturamento **realizado** (atendidos) e **previsto** (futuros) no período;
  - taxa de faltas e cancelamentos;
  - serviços mais vendidos; resultado por profissional;
  - uso da franquia de lembretes.
- **Configurações:** dados e marca, horário de funcionamento, regras de agenda (§7.4), mensagens (§8), usuários e papéis, assinatura.
- **Notificação de novo agendamento** para o estabelecimento: no painel em tempo real, por **notificação push do PWA** (gratuita, não consome franquia) e, opcionalmente, por WhatsApp para o número do dono (conta na franquia) **[decisão do Claude]**.
- PWA instalável no celular do dono e da equipe (ver §7.5).

### 7.3 Painel do super-admin (Ricardo)
- Lista de estabelecimentos com status: em teste, ativo, inadimplente, somente leitura, cancelado.
- Criar estabelecimento (com pré-configuração), editar, trocar plano, estender teste, bloquear ou desbloquear.
- "Entrar como" o estabelecimento (com auditoria).
- Métricas: MRR, estabelecimentos por status, conversão teste→pago, agendamentos totais, mensagens enviadas e custo estimado de WhatsApp, uso do limite diário da Meta (§8).
- Configuração dos planos (preço, limites, franquias), sem mexer no código.

### 7.4 Regras de agenda (configuráveis por estabelecimento; padrões **[decisão do Claude]**)
- Fuso horário do estabelecimento (padrão `America/Sao_Paulo`).
- Intervalo entre os horários oferecidos: 15 min.
- Intervalo entre atendimentos (buffer): 0 min, configurável por serviço.
- Antecedência mínima para agendar: 1 h.
- Até quantos dias à frente: 60.
- Cancelamento ou remarcação pelo cliente até: 2 h antes.
- Status do agendamento: `agendado` → `confirmado` (cliente ou estabelecimento confirmou) → `atendido` | `faltou`; ou `cancelado` (por quem e quando ficam registrados).

### 7.5 PWA, ícones e pré-visualização de links (pedido do Ricardo)
O sistema é um **PWA completo desde a primeira versão**, seguindo as boas práticas:
- **Manifest** com nome, nome curto, cores de tema e fundo, `display: standalone` e atalhos (ex.: "Agenda de hoje", "Novo agendamento").
- **Ícone instalado no iPhone** (`apple-touch-icon` 180×180, título e status bar configurados para iOS) e **no Android** (192 e 512, mais versão *maskable* com margem de segurança para não cortar a logo).
- **Favicon** na aba e na barra de endereço (`favicon.ico` + SVG + PNG) e tela de abertura (splash) coerente com a marca.
- **Pré-visualização ao compartilhar o link** (Open Graph e Twitter Card: título, descrição e imagem 1200×630) para WhatsApp, Instagram, Facebook e afins.
- Na **página pública de cada estabelecimento**, a pré-visualização do link usa o **nome, a logo e a cor do estabelecimento** (imagem gerada automaticamente), para que o link colado no WhatsApp pareça do salão e não da plataforma **[decisão do Claude]**.
- Service worker com cache do "esqueleto" do app para abrir rápido; agendar exige internet (sem agendamento offline, para não haver conflito de horário) **[decisão do Claude]**.
- Convite discreto para instalar o app no painel (no iPhone, instrução de "Adicionar à Tela de Início", porque o iOS não mostra botão automático).
- Notificações push (Android e iPhone com o app instalado, iOS 16.4+) para novos agendamentos, cancelamentos e remarcações.
- Todos os ícones e imagens são gerados a partir da **logo oficial que o Ricardo colocará no repositório** (pasta `marca/`); não inventar logo.

### 7.6 Ambiente de demonstração
Estabelecimento demo público com dados fictícios, recriado automaticamente todo dia, isolado da produção (sem enviar WhatsApp real). Ricardo usa nas vendas.

## 8. Lembretes por WhatsApp (decidido)

- **Canal:** WhatsApp Cloud API **oficial**, com **um número central da plataforma** (nome de exibição ligado à marca Eneven Agenda), enviando em nome de cada estabelecimento.
- **Sem CNPJ por enquanto:** a conta Meta Business fica sem verificação. Limite da Meta: **250 destinatários únicos fora da janela de atendimento por 24 h**, 2 números, templates aprovados normalmente. Isso atende cerca de 20 a 25 estabelecimentos pequenos.
- **Mensagens (templates de categoria utilidade):**
  1. confirmação na hora do agendamento;
  2. lembrete na véspera, com botões **Confirmar / Remarcar / Cancelar**;
  3. lembrete 2 h antes: opcional por estabelecimento, desligado por padrão **[decisão do Claude]**;
  4. aviso de remarcação feita pelo estabelecimento;
  5. aviso de cancelamento feito pelo estabelecimento.
  O texto leva o nome do estabelecimento, serviço, profissional, data e hora. O estabelecimento pode ligar ou desligar cada tipo; o texto dos templates é fixo (aprovado na Meta).
- **Respostas:** os botões atualizam o status do agendamento via webhook. Qualquer outra mensagem recebida no número central gera resposta automática com o link `wa.me` do estabelecimento.
- **Custo:** cerca de R$ 0,035 por mensagem de utilidade (tabela da Meta em BRL desde 07/2026; mensagens dentro da janela de 24 h aberta pelo cliente não são cobradas). Pago pelo Ricardo e embutido nos planos.
- **Franquia mensal por plano**, medida por estabelecimento. Ao acabar: os envios automáticos param, o painel avisa e o estabelecimento continua com o botão manual "lembrar pelo WhatsApp" (abre o WhatsApp do estabelecimento com o texto pronto) **[decisão do Claude]**.
- **Proteção do limite diário:** fila de envio que respeita o teto de 250/24 h, prioriza lembretes de véspera e alerta o Ricardo ao chegar a 70% do teto.
- **Futuro (com CNPJ):** Ricardo verifica a empresa e vira Tech Provider da Meta. Cada estabelecimento poderá conectar o próprio número do WhatsApp Business (coexistência, continua usando o app) e pagar a Meta direto no cartão dele. Começar a abertura do CNPJ quando houver por volta de 15 estabelecimentos ativos, porque a verificação leva tempo. **O envio é construído com o canal plugável**, para essa troca não exigir reescrita.
- **Proibido:** Evolution ou qualquer API não oficial como canal do produto.

## 9. Planos e preços (hipótese para validar com os primeiros clientes)

| Plano | Preço/mês | Profissionais | Franquia de mensagens/mês | Extras |
|---|---|---|---|---|
| Essencial | R$ 39,90 | até 2 | 300 | tudo do §7 |
| Profissional | R$ 69,90 | até 6 | 800 | lembrete de 2 h, relatórios por profissional |
| Studio | R$ 109,90 | ilimitados | 1.500 | prioridade no suporte; sinal por Pix quando existir |

Referência de custo: um salão com 5 atendimentos por dia (~130/mês) gasta cerca de 260 mensagens (≈ R$ 9) com confirmação e lembrete de véspera.
Plano anual com 2 meses grátis e desconto para quem tem landing page da Eneven: a definir pelo Ricardo. Preços, franquias e limites ficam configuráveis no painel do super-admin. Franquias e limites por plano são **[decisão do Claude]**.

## 10. Cobrança da assinatura

- Mercado Pago (conta já usada pela Eneven), com assinatura recorrente no cartão e Pix mensal como alternativa.
- O estabelecimento assina, troca de plano e vê as faturas dentro do painel.
- Status do pagamento atualizado **somente por webhook verificado** do Mercado Pago.
- Atraso: aviso no painel e por e-mail; após **7 dias [decisão do Claude]** vira somente leitura; ao pagar, reativa na hora.

## 11. Restrições técnicas e de operação

- Hospedagem na VPS do Ricardo via **Easypanel**, como o Eneven Hub; banco **PostgreSQL próprio**, separado do Hub.
- Domínio: `agenda.eneven.com.br` **[decisão do Claude]**, DNS no Cloudflare apontando com registro A, sem proxy, para a VPS (padrão do Ricardo). Links públicos em `agenda.eneven.com.br/{slug}`; painel e cadastro no mesmo domínio em rotas reservadas.
- Repositório privado no GitHub da conta RicardovSantos, com README.
- Interface toda em português do Brasil; valores em R$; datas no formato brasileiro.
- LGPD: termos de uso, política de privacidade, consentimento no agendamento, exportação e exclusão de dados do cliente a pedido do estabelecimento, e exportação de todos os dados do estabelecimento ao cancelar.
- Backup diário do banco com retenção, mais monitoramento de disponibilidade (UptimeRobot).
- Segredos (tokens da Meta, Mercado Pago) só em variáveis de ambiente do Easypanel, nunca no repositório.

## 12. Escolhas técnicas **[decisão do Claude]**

- **Aplicação única** em Next.js (App Router) + TypeScript, servindo página pública, painéis e API; um serviço no Easypanel com Dockerfile.
- **UI:** Tailwind + shadcn/ui, com tema claro e escuro. Painel com identidade Eneven; a página pública usa logo e cor do estabelecimento.
- **Banco:** PostgreSQL com ORM tipado (Drizzle). Multiempresa com banco compartilhado e `tenant_id` em todas as tabelas do estabelecimento, acessadas por uma camada de consulta sempre filtrada por tenant, mais Row Level Security como segunda barreira.
- **Dupla reserva:** constraint de exclusão no Postgres (`btree_gist`, intervalo `tstzrange` por profissional, ignorando cancelados). A garantia fica no banco, não só no código.
- **Jobs** (lembretes, fila de envio, expiração de teste, reset da demo, cobrança): fila no próprio Postgres (pg-boss) num worker do mesmo projeto. O n8n não faz parte do núcleo.
- **Autenticação:** e-mail e senha com recuperação por e-mail; sessões no banco.
- **E-mail transacional** (recuperação de senha, avisos de cobrança): ZeptoMail, que o Ricardo já usa.
- **Testes** automatizados obrigatórios para disponibilidade de horários, dupla reserva concorrente e isolamento entre tenants.

## 13. Marca

- Logo oficial: `marca/logo.png` (2172×724, PNG RGB com fundo branco, sem transparência). Texto da logo: **"Eneven — Agendamentos Inteligentes"**.
- Cores extraídas da logo: degradê de **#3E07D2** (índigo) → **#9429F7** (roxo) → **#F581FB** (rosa); texto escuro **#29303C**.
- Símbolo para ícones (app, favicon, push): o **"E" com o ponto de conexão**, recortado da logo, sobre fundo claro ou sobre o degradê.
- **A logo atual é provisória.** Ricardo vai substituir `marca/logo.png` por uma versão corrigida, com o mesmo nome e formato. Por isso todos os ícones, favicons, splash e imagens de compartilhamento são **gerados por script a partir desse arquivo** (no build), nunca editados à mão: trocar o arquivo e refazer o deploy atualiza tudo. O recorte do "E" é feito por proporção/região configurável no script.
- Nome exibido do produto: **Eneven Agendamentos Inteligentes** (como na logo) **[decisão do Claude]**; repositório e pasta: `eneven-agenda-inteligente`.

## 14. Antes de construir as telas

Ricardo faz questão de um visual bonito e profissional. A direção visual (cores, tipografia, layout da agenda e da página pública) deve ser validada com ele em mockups antes de a implementação das telas começar.

## 15. Deixado para quem constrói

Estrutura de pastas, nomes de tabelas e rotas, bibliotecas auxiliares, textos exatos dos templates (respeitando a categoria utilidade), detalhes de layout dentro da direção visual aprovada, estratégia de deploy contínuo.

## 16. Pontos em aberto (não bloqueiam o MVP)

- Domínio próprio para o produto no futuro.
- Preço anual e desconto para cliente de landing page.
- Quais estabelecimentos serão os pilotos.
- Quando e como integrar com o Eneven Hub (via API, sem compartilhar banco).
