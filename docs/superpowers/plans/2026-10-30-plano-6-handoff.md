# Plano 6 — demonstração, dados e notificações

Branch `plano-6`, baseada em `main` após o Plano 4. O Plano 5 de cobrança está separado na branch `plano-5` e permanece pendente.

## Demonstração

Primeiro passo: `/demo` é uma simulação pública com serviços e horários fictícios mantidos apenas na memória do navegador. `/demo/painel` mostra um painel ilustrativo e pode apresentar a opção escolhida por meio de parâmetros restritos a serviços e horários fictícios. Não grava no banco, não solicita dados pessoais e não envia WhatsApp. Recarregar a primeira página reinicia a experiência; o link do painel pode manter a seleção fictícia. É uma prévia isolada, ainda não substitui a demo completa prevista na especificação: um estabelecimento demonstrativo com painel e dados fictícios renovados diariamente.

Para concluir: definir acesso ao painel de demonstração e suas permissões, isolar os dados dos estabelecimentos reais e impedir mensagens e outras integrações externas em todas as operações. Preparar recriação diária sem apagar ou modificar dados reais. Testar em navegador e revisar concorrência e proteção contra abuso antes de disponibilizar publicamente.

## Dados e notificações

- Definir e implementar preservação, exportação e exclusão/anonimização conforme a especificação e os termos, incluindo avisos e exceções aplicáveis. Não automatizar exclusões até revisar os requisitos e uma estratégia de recuperação.
- Implementar notificações push para novos agendamentos, cancelamentos e remarcações, com consentimento, controle por dispositivo e remoção de assinaturas inválidas. Testar Android e iPhone com aplicativo instalado.
- O Plano 4 ainda requer configuração real da Meta, modelos, webhook e cron e testes finais. O Plano 5 ainda requer implementação e validação no sandbox do Mercado Pago antes de ativar cobrança.
