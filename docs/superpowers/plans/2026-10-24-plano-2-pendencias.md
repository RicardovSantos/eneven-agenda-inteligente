# Pendências e decisões do Plano 2 (Núcleo da agenda)

Registro das decisões tomadas pelo controlador durante a execução e dos itens menores deixados para os próximos planos.

## Decisões (rulings)
- Ruling P1: o horário padrão e o dono-como-profissional são criados dentro de createTenantWithOwner (mesma transação), via withTenant. — evita estabelecimento sem agenda — custo: retoque nos testes de signup.
- Ruling P2: visão "Semana" adiada (Mês + Dia por profissional no Plano 2). — mockups aprovados mostram Mês; reduz escopo — custo: Ricardo pode pedir depois.
- Ruling P3: FKs compostas (tenant_id, id) entre tabelas de tenant + UNIQUE(tenant_id,id) nos pais. — fecha buraco de isolamento no banco — custo: migração mais complexa.
- Ruling P4: 0002/0003 reescritas no lugar (nunca aplicadas em banco compartilhado; produção está na 0001). — histórico limpo — custo: apagar .data local.
- Ruling P5: remarcação feita pela equipe ignora horário de funcionamento/antecedência (como allowOutsideHours), mantendo conflito e bloqueios; cliente segue todas as regras + janela. — salão precisa encaixar — custo: equipe pode marcar fora do expediente por engano.
- Ruling P6: allowOutsideHours só vale com source "panel". — impede bypass público — custo: nenhum.
- Ruling P6b: agendamento público não sobrescreve nome/e-mail de cliente existente (só preenche vazios); painel continua sobrescrevendo. — dado anônimo não reescreve CRM — custo: nome digitado diferente pelo cliente não atualiza.
- Ruling P7: correções visuais antes da review + página /painel/mais (Serviços, Equipe, Configurações, link, Sair). — mobile precisa de navegação completa — custo: nenhum.
- Ruling P8 (para Task 7): página pública /[slug] deve ser dinâmica (sem cache estático) ou revalidada ao salvar configurações/serviços/equipe — senão nome/cor/slug ficam velhos. — risco 7 da review do T4 — custo: nenhum.
- Ruling P9: filtro archivedAt IS NULL em loadAvailabilityContext + teste de que serviço arquivado não pode ser agendado. — promessa do diálogo "sai da página e da agenda" — custo: nenhum.
- Ruling P10: tenants já existentes em produção (inclusive a conta do Ricardo) não têm horário/profissional semeados → onboarding garante defaults de forma idempotente; foco no h1 ao trocar de etapa; link da tela final sem quebra no meio; teste estático de requireOnboarded em toda página do painel; nota no withTenantTx. Enviado como follow-up ao implementer. — minor que vira carga em produção — custo: um commit.
- Ruling P11: após agendar, history.replaceState para /agendamento/{token} (recarregar mostra o mesmo agendamento). — evita perder o link de gestão sem e-mail/WhatsApp — custo: token no histórico do navegador (é o próprio link de gestão).
- Ruling P12: cliente só remarca se o salão puder receber agendamentos (canBook); cancelar continua sempre permitido. — salão bloqueado não recebe novos horários — custo: nenhum.
- Ruling P13: contagem de visitas "até este agendamento, inclusive" aceita; toast "Presença confirmada" aceito. — combina com rótulo e verbo do botão — custo: nenhum.
- Ricardo deu OK antecipado (25-10-2026) para juntar plano-2-agenda na main (deploy automático) após revisão final limpa.
- Ruling P14: onda única: confirmar presença pelo link (do jeito certo, não só trocar o texto) + "Aplicar também à equipe" com recorte automático + minors (nome do dono truncado, PWA só no painel, teste vencido não libera link, nota no README sobre superusuário). Brief: final-fix-brief.md. — UX do primeiro dia — custo: uma rodada.
- Ruling P15: remover piso absoluto de 5 ms; comparar com senha errada medida na mesma execução (mediana de 5). — teste dependente da máquina, proteção de tempo segue verificada pela comparação relativa — custo: nenhum. Merge bloqueado até CI verde.
- Ruling P16: seguir com o merge; e2e fica fora do CI; estabilizar a suíte e2e (isolamento de banco por spec) entra como pendência do próximo plano. — CI + revisão final limpos, falha não reproduz isolada — custo: e2e completo pode falhar intermitentemente.

## Pendências menores
- Task 1: minor (deferred): SET NULL (service_id) patch manual na 0002 — regenerar a 0002 perderia o patch (comentário + teste protegem); FKs RESTRICT bloqueiam excluir tenant com agendamentos; tenants sem RLS e só SELECT para agenda_app (updates de settings fora do withTenant); default privileges sem SEQUENCES
- Task 2: minor (deferred): encaixe em minutos locais (risco só em fusos com horário de verão; documentar); teste "independe do fuso" fraco (CI poderia rodar com TZ=Asia/Tokyo); getAvailableDates sem saída antecipada; data inválida 2026-02-31 rola para março; WeeklyHours sem chave → TypeError; "24:00" não representável; lacunas de teste (bloqueio de B não afeta A, ocupado que atravessa meia-noite, diffDays)
- Task 3: minor (deferred): leituras repetidas de tenants/services na transação; lógica de colisão duplicada entre bookings.ts e availability.ts; telefone inválido usa código invalid_selection; serviço apagado pula checagem ao trocar profissional; loadAvailabilityContext não valida visível/arquivado (Task 7 deve validar antes); nome de teste trocado
- Task 4: minor (deferred): bodySizeLimit 2mb global para todas as server actions; timers de toast não limpos ao desmontar
- Task 4: minor (deferred): hasAlphanumeric duplicado (slug-form.tsx e slug.ts); removeLogo não transacional; regex NFD com caracteres literais em slug-form.tsx
- Task 5: minor (deferred): contenção não une intervalos de funcionamento encostados (09–12 + 12–18 rejeita 11–14) — conservador; contagem de futuros no diálogo pode estar velha; edições concorrentes last-write-wins
- Task 5: minor (deferred): sem teste de componente para o remount do formulário de profissional; remount descarta edição em andamento
- Task 6: minor (deferred): syncTeamHours sobrescreve serviços/horários dos profissionais ao voltar e mudar horário no assistente; ações das outras páginas utilizáveis antes de concluir o onboarding (owner-only, aceitável)
- Task 6: minor (deferred): guarda estática é só "contém requireOnboarded("; isOwner opcional em WizardProfessional; ensureTenantDefaults re-semeia horário se zerado antes de concluir
- Task 7: minor (deferred): e2e confere a linha no banco, não a tela da agenda (Task 8/9 cobre); getPublicTenant/catálogo repetidos por requisição (usar cache()); fonte Outfit no OG lida de src/ (conferir no build standalone); aviso inline em vez de toast de 4 s no gerenciar
- Task 7: minor (deferred): limitBooking combinado ficou sem uso (código morto); horário passado retorna slot_taken em vez de erro de validação
- Task 8: minor (deferred): checagem de permissão e mutação não atômicas (loadOwned fora do FOR UPDATE); createBlock sem aviso de sobreposição; a11y (role=dialog no painel inline, foco no sheet móvel, "Em breve" só em title, role=tab sem tabpanel); sem teste de borda 23:30 local; encaixe permite passado (decisão de produto); sem rate limit na busca de clientes
- Task 9: minor (deferred): duas chaves em outputFileTracingIncludes (manter uma); armadilha de foco não puxa foco que está fora da folha; retorno de foco perde gatilho desmontado; tests/e2e/task9-shots.spec.ts é spec de capturas no repo; link no menu lateral quebra no meio do slug

## A conferir após o deploy
- __drizzle_migrations com 4 linhas (0000–0003) no agenda-db.
- Dono existente entra em /painel/comecar e recebe horário + profissional padrão (ensureTenantDefaults).
- Página pública /{slug} e imagem de compartilhamento no ar; OG com a fonte Outfit.
- Estabilizar a suíte e2e (banco isolado por spec) antes de colocá-la no CI.
