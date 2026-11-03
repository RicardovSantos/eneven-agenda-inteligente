# Eneven Agenda — direção visual

Referência fornecida: https://suitable.com.br/ (captura em 03/11/2026).

## Evidência e limites

Firecrawl retornou navegação, rodapé, branding e screenshot. Os pixels da captura foram inspecionados: navegação branca em container flutuante sobre fundo cinza claro, logo à esquerda, links centrais e ação violeta à direita. O corpo central permaneceu vazio mesmo após espera de 8 segundos; a tentativa de navegador remoto expirou. Portanto, composição do hero, demonstrações e seções abaixo são uma proposta original para Eneven, não uma reprodução verificada da Suitable.

## Extraído da referência

- Fundo #F6F6F6; texto #202020; destaque #5F57F7 (branding Firecrawl).
- Botão primário com raio 6px; navegação horizontal, espaçosa e discreta.
- Fonte identificada como Quicksand; o extrator também retornou Roboto em stacks, sem confirmação do corpo central.
- Screenshot inspecionado: /workspace/suitable-reference.png.
- Logos e parceiros Suitable são somente referências e não foram reutilizados.

## Adaptação Eneven

- Fundo #F7F7F9; texto #24202F; violeta #693BF0, mantendo relação com o roxo Eneven #3E07D2.
- Manrope para títulos e DM Sans para texto. Tipografia central, sem títulos em caixa alta.
- Container 1230px; navbar branca flutuante; hero central com painel grande e celular sobreposto.
- Grade assimétrica de recursos; área lilás com demonstração em abas; fotografia de ambiente; onboarding e FAQ.
- Bordas delicadas, raios 9/16/22px, sombras difusas somente em mockups. Movimento de entrada com IntersectionObserver e opção de movimento reduzido.
- Prévia identificada como ilustrativa; os botões abrem demos reais do app. Sem depoimentos, métricas ou descontos inventados.
- Imagem de ambiente ilustrativa: https://images.unsplash.com/photo-1600948836101-f9ffda59d250 . Não representa salão cliente da Eneven.
- Mobile: menu expansível, painel simplificado e celular reduzido, seções em coluna única. Testar 390, 768 e 1440px.

## Implementação

HTML/CSS/JS nativos servidos pelo Worker existente. Mantém domínio, DNS, login e cadastro. Não altera código ou banco do aplicativo.
