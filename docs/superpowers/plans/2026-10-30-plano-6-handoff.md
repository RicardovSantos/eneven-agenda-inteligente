# Plano 6 — demonstração, dados e notificações

Branch `plano-6`, baseada em `main` após o Plano 4. O Plano 5 de cobrança está separado na branch `plano-5` e permanece pendente.

## Demonstração

Primeiro passo: `/demo` é uma simulação pública com serviços e horários fictícios mantidos apenas na memória do navegador. `/demo/painel` mostra um painel ilustrativo e pode apresentar a opção escolhida por meio de parâmetros restritos a serviços e horários fictícios; essa seleção expira à meia-noite em São Paulo. Não grava no banco, não solicita dados pessoais e não envia WhatsApp. Recarregar a primeira página reinicia a experiência. É uma prévia isolada, ainda não substitui a demo completa prevista na especificação: um estabelecimento demonstrativo com painel e dados fictícios renovados diariamente.

O painel ilustrativo permite simular confirmação, cancelamento e restauração de atendimentos. As situações fictícias são guardadas no navegador e reiniciadas no dia seguinte no fuso de São Paulo; não alteram agendas nem enviam mensagens reais. Isso não cria um estabelecimento demonstrativo compartilhado.

Para concluir: definir acesso ao painel de demonstração e suas permissões, isolar os dados dos estabelecimentos reais e impedir mensagens e outras integrações externas em todas as operações. Preparar recriação diária sem apagar ou modificar dados reais. Testar em navegador e revisar concorrência e proteção contra abuso antes de disponibilizar publicamente.

O teste direcionado de navegador `tests/e2e/demo.spec.ts` passou em viewport de celular, cobrindo a simulação, o painel e a expiração da seleção. As duas páginas também foram inspecionadas visualmente em celular (390 px) e computador (1280 px). A suíte completa permanece pendente.

## Dados e notificações

- Definir e implementar preservação, exportação e exclusão/anonimização conforme a especificação e os termos, incluindo avisos e exceções aplicáveis. Não automatizar exclusões até revisar os requisitos e uma estratégia de recuperação.
- Implementar notificações push para novos agendamentos, cancelamentos e remarcações, com consentimento, controle por dispositivo e remoção de assinaturas inválidas. Testar Android e iPhone com aplicativo instalado.
- O service worker já aceita notificações com textos genéricos e abre apenas o próprio painel; não exibe dados de clientes recebidos no payload. Ainda não existem cadastro de dispositivos, consentimento nem envio de push, portanto essa funcionalidade não está ativa. Planejar a migração depois de conciliar a numeração das migrações 0013–0020 pendentes na branch do Plano 5.
- `enablePushForDevice` prepara a permissão e inscrição do navegador após clique explícito, validando a chave e não substituindo inscrições de outra chave. Ainda precisa de interface e salvamento autenticado por estabelecimento; não chamá-la até o armazenamento seguro existir. Testar em iPhone e Android reais.
- O Plano 4 ainda requer configuração real da Meta, modelos, webhook e cron e testes finais. O Plano 5 ainda requer implementação e validação no sandbox do Mercado Pago antes de ativar cobrança.
