# Plano 4 — decisões e pendências

- A fila reserva a franquia antes do envio e mantém tentativas com resultado incerto bloqueadas para revisão manual. Confirmar o resultado na Meta antes de autorizar novo envio; não existe garantia de entrega exatamente uma vez em falha de comunicação.
- Os eventos recebidos são guardados cifrados para recuperação até serem concluídos. A recuperação depende de `SESSION_SECRET`; planejar a rotação antes de trocar a chave.
- Validar em PostgreSQL 17 as migrações 0010–0012, concorrência, recuperação e filtros de consumo, e conferir o CI da versão final.
- Completar testes de navegador do fluxo inteiro e revisar a integração de agendamentos com a fila, os requisitos do plano e a segurança antes de liberar.
- Configurar e verificar webhook, modelos aprovados, segredos e agendador externo antes de ativar a funcionalidade em produção.
