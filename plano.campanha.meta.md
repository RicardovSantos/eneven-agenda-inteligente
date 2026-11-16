# Plano de campanha Meta Ads — Eneven Agenda

Landing: https://agendamento.eneven.com.br/
Conta de anúncios: Eneven Tech Principal (`1943153123311977`)
Criativo: banner em imagem (4:5 e 9:16)

## Resolver antes de gastar

1. **Teste grátis.** A landing promete 30 dias grátis sem cartão, mas o app ainda dá 14 dias (`TRIAL_DAYS = 14` em `src/server/auth/signup.ts`). Ajustar o app para 30, ou não usar "30 dias" no banner.
2. **Pixel na landing.** Não há registro de Pixel do Meta em agendamento.eneven.com.br. Sem ele o Meta não mede cadastro nem otimiza a entrega. Conferir em https://business.facebook.com/events_manager2.
3. **Pagamento da conta.** Em 9/9 a conta pausou por limite de faturamento. Conferir a forma de pagamento em https://business.facebook.com/billing_hub.
4. **UTMs.** Os botões da landing levam a `agenda.eneven.com.br/cadastro` com UTMs próprios (`utm_source=landing`). Confirmar se o `utm_source=meta` do anúncio chega até o cadastro; se não chegar, não dá para separar o tráfego do Meta.

## Passo a passo

### 1. Criar o banner
- Medidas: **1080×1350 (4:5)** para o feed e **1080×1920 (9:16)** para stories e reels. No 9:16, deixar 250 px livres no topo e na base.
- Ferramenta: https://www.canva.com/create/facebook-ads/
- Formato do arquivo: JPEG ou PNG.
- Layout:
  - Título: "Cada horário vazio é dinheiro que não volta."
  - Subtítulo: "Agenda online com lembrete no WhatsApp para salão, estética e barbearia."
  - Imagem: print real do app (celular com a agenda), no índigo `#3E07D2` da identidade.
  - Preço: "A partir de R$ 39,90/mês."
  - Prazo: "Teste grátis sem cartão" (só escrever "30 dias" depois de resolver o item 1).
  - Botão: "Criar minha agenda grátis".
- Regras: sem depoimento nem número de clientes inventado, sem promessa de resultado. O exemplo "2 faltas de R$ 90 por semana = R$ 720 por mês" vale se estiver marcado como exemplo.

### 2. Link do anúncio com rastreio
```
https://agendamento.eneven.com.br/?utm_source=meta&utm_medium=paid&utm_campaign=agenda_cadastro&utm_content=banner_01
```

### 3. Criar a campanha em https://adsmanager.facebook.com

**Campanha**
- Objetivo: Tráfego.
- Nome: `AGENDA | trafego LP | Nov26`.
- Orçamento no nível da campanha (CBO): R$ 20/dia.

**Conjunto de anúncios**
- Otimização: Visualizações da página de destino. Com R$ 20/dia não há cadastros suficientes para otimizar por eles (ver passo 6).
- Público: Brasil, 25 a 55 anos, português, aberto, sem interesses. O Meta não tem segmentação "dono de salão", só interesses de consumo; com verba baixa, público aberto e banner que se autosseleciona funcionam melhor.
- Posicionamentos: Advantage+ (ou só feed, stories e reels do Instagram e do Facebook).

**Anúncio**
- Subir as duas artes (4:5 e 9:16).
- Link do site: o do passo 2.
- Botão: Cadastre-se.
- Texto principal:
  > Você perde dinheiro toda vez que uma cliente esquece o horário. O Eneven Agenda manda o lembrete pelo WhatsApp, evita buraco na agenda e a cliente marca sozinha pelo seu link. Teste grátis, sem cartão. Planos a partir de R$ 39,90/mês.
- Título: "Agenda online com lembrete no WhatsApp".

### 4. Publicar e esperar
- Revisar a prévia no celular e publicar.
- Deixar rodar 7 dias sem mexer, para completar a fase de aprendizado. Total do teste: R$ 140.

### 5. Ler os números
No Gerenciador de Anúncios, ou pelo MCP do Meta Ads.

Metas de partida (hipóteses, ajustar com os números reais):

| Métrica | Bom | Ajustar |
|---|---|---|
| CTR no link | acima de 1% | abaixo de 0,7%: trocar o banner |
| Custo por clique | até R$ 1,50 | acima de R$ 3: público ou criativo fraco |
| Cadastros (Hub ou app) | qualquer um com UTM meta | 0 cadastros com 100+ cliques: problema na página |

### 6. Decidir
- Banner e página funcionaram: criar um segundo banner com outro ângulo e passar a otimizar por **cadastro** (evento do Pixel).
- Cliques bons e zero cadastros: o problema é a página ou o cadastro, não o anúncio.
- Cliques ruins: trocar o ângulo do banner antes de mexer no público.
- Testar uma variável por vez.

## Links
- Gerenciador de Anúncios: https://adsmanager.facebook.com
- Eventos e Pixel: https://business.facebook.com/events_manager2
- Faturamento: https://business.facebook.com/billing_hub
- Criar banner: https://www.canva.com/create/facebook-ads/
- Landing: https://agendamento.eneven.com.br/
