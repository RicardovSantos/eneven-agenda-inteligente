# Integração com o Google Agenda

Envia os agendamentos do Eneven Agenda para uma agenda chamada **"Eneven Agenda"** dentro do Google Agenda da
pessoa. Um sentido só (Agenda → Google): alterações feitas no Google não voltam.

## Como funciona
- **Quem conecta:** dono e recepção recebem os agendamentos de **todos** os profissionais; profissional com
  cadastro ligado ao login (Equipe) recebe só os **dele**. Cada pessoa liga a própria conta Google em
  **Configurações > Integrações** (dono) ou **Mais > Integrações** (os demais).
- **Escopo pedido:** `https://www.googleapis.com/auth/calendar.app.created` (+ `openid email`). O app cria a
  agenda "Eneven Agenda" e só mexe nela; nunca lê os outros eventos da pessoa.
- **Sincronização:** o servidor, a cada minuto, lê os agendamentos alterados (`bookings.updated_at`) e cria,
  atualiza ou apaga o evento. Nenhum código de agendamento foi alterado: se o Google falhar, o agendamento
  não é afetado. Falha temporária = nova tentativa com espera crescente (até 1 h); acesso retirado = a tela
  pede "Reconectar"; agenda apagada no Google = o app cria outra e reenvia tudo.
- **O que vai para o Google:** cliente, serviços, profissional, valor, situação e horário. Sem telefone, sem
  observações, sem convidados (o Google não manda e-mail a ninguém).
- **Segurança:** o token de renovação fica cifrado (AES-256-GCM, chave derivada do `SESSION_SECRET`). As duas
  tabelas (`google_calendar_connections`, `google_calendar_events`) não são acessíveis ao papel restrito da
  aplicação.
- **Exclusão de conta:** retira o acesso no Google antes de apagar. Desconectar também retira; os eventos já
  criados ficam na agenda da pessoa.

## Ligar (hoje está DESLIGADO)
Sem a variável abaixo o card aparece travado ("Em breve") e nada roda:

```
GOOGLE_CALENDAR_ENABLED=true
```

Usa as mesmas `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` do login com Google.

## Passos no Google Cloud (só o dono do projeto consegue)
1. **URL de retorno autorizada:** em *APIs e serviços > Credenciais > cliente OAuth*, adicione
   `https://agenda.eneven.com.br/api/google-agenda/retorno` (além da do login).
2. **Ativar a API:** *Biblioteca* > "Google Calendar API" > Ativar.
3. **Escopos:** em *Tela de consentimento OAuth > Acesso a dados*, adicione `calendar.app.created` e veja em
   qual categoria o Google o coloca (não sensível, sensível ou restrito).
4. **Publicar:** a tela de consentimento precisa estar **Em produção**. Em "Testing" a autorização vence em
   7 dias e só 100 testadores podem usar.
5. **Se o escopo for sensível:** pedir a verificação do app (justificativa por escrito, vídeo mostrando o
   uso, política de privacidade publicada; costuma levar de 3 a 5 dias úteis). Roteiro do vídeo abaixo.

## Roteiro do vídeo de verificação (se pedirem)
1. Mostrar o app em `agenda.eneven.com.br` e a política de privacidade (`/privacidade`).
2. Entrar como dono, abrir *Configurações > Integrações > Google Agenda*, clicar em **Conectar conta Google**.
3. Mostrar a tela de consentimento do Google (com o escopo de agenda do app) e aceitar.
4. Voltar ao Eneven Agenda: card "Ativado", conta e agenda "Eneven Agenda".
5. Criar um agendamento (painel ou página pública) e abrir o Google Agenda mostrando o evento na agenda
   "Eneven Agenda". Remarcar e cancelar, mostrando o evento mudar e sumir.
6. Mostrar **Desativar** e **Desconectar**.

Justificativa curta: "O Eneven Agenda é um sistema de agendamento para salões. A integração cria uma agenda
secundária na conta do usuário e grava nela os atendimentos marcados, para que o profissional os veja no Google
Agenda. O app não lê nem altera outros eventos."

## Limites conhecidos
- Primeira carga: até 1000 agendamentos futuros por conexão.
- Um sentido só; bloquear horário no Agenda por causa de evento do Google fica para uma fase 2.
- Se a pessoa renomear a agenda no Google, a tela continua mostrando "Eneven Agenda".
