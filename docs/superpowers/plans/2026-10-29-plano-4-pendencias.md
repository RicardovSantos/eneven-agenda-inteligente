# Plano 4 — decisões e pendências

- A fila reserva a franquia antes do envio e mantém tentativas com resultado incerto bloqueadas para revisão manual. Confirmar o resultado na Meta antes de autorizar novo envio; não existe garantia de entrega exatamente uma vez em falha de comunicação.
- Os eventos recebidos são guardados cifrados para recuperação até serem concluídos. A recuperação depende de `SESSION_SECRET`; planejar a rotação antes de trocar a chave.
- O CI do commit `5aceb99` passou, incluindo PostgreSQL 17 e os testes existentes de navegador. Ainda é necessário ampliar a cobertura PostgreSQL da recuperação e dos filtros de consumo.
- Completar testes de navegador do fluxo inteiro e revisar a integração de agendamentos com a fila, os requisitos do plano e a segurança antes de liberar.
- Configurar e verificar webhook, modelos aprovados, segredos e agendador externo antes de ativar a funcionalidade em produção.
