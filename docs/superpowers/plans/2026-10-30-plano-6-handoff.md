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
- O service worker já aceita notificações com textos genéricos e abre apenas o próprio painel; não exibe dados de clientes recebidos no payload. Ainda falta o envio de push, portanto a funcionalidade não está ativa.
- `/painel/configuracoes/notificacoes` permite ao dono cadastrar ou remover este dispositivo quando `PUSH_VAPID_PUBLIC_KEY` está configurada. A interface informa que o envio ainda está em preparação; modo suporte não pode cadastrar. `enablePushForDevice` solicita permissão após clique e não substitui inscrições de outra chave. Testar em iPhone e Android reais; preparar remoção de inscrições que não existem mais no navegador.
- `validatePushSubscription` valida formato, HTTPS e chaves da inscrição no servidor, ignorando identificadores de estabelecimento fornecidos pelo cliente. Validar formato não autoriza acesso de rede: antes do envio, implementar proteção contra SSRF, redirecionamentos e destinos indevidos.
- A migração `0013_huge_reavers` e as funções `savePushSubscription` e `removePushSubscription` preparam armazenamento com vínculo ao usuário e estabelecimento, restrição de acesso direto e remoção ao excluir o vínculo. As actions obtêm usuário e estabelecimento da sessão e exigem o dono. PostgreSQL 17 passou no CI do commit `2f10e08`. **Antes de juntar o Plano 5, reconciliar a numeração, snapshots e timestamps das migrações 0013–0020 de cobrança com esta nova 0013, sem reescrever migrações já aplicadas em produção.**
- O Plano 4 ainda requer configuração real da Meta, modelos, webhook e cron e testes finais. O Plano 5 ainda requer implementação e validação no sandbox do Mercado Pago antes de ativar cobrança.
