"use client";

import { resolveOutboundWhatsApp, resolveWhatsAppEvent } from "@/app/admin/whatsapp/actions";

export function WhatsAppRecoveryForm({ id, canRetry, tenantId }: { id: string; canRetry: boolean; tenantId?: string }) {
  return <form action={tenantId ? resolveOutboundWhatsApp : resolveWhatsAppEvent} onSubmit={(event) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const retry = submitter?.value === "retry";
    if (!window.confirm(retry ? "Confirme que a resposta não foi enviada. Repetir sem verificar pode enviar uma mensagem duplicada. Continuar?" : "Confirme que a ocorrência já foi tratada. Continuar?")) event.preventDefault();
  }} className="flex flex-wrap gap-2">
    <input type="hidden" name="id" value={id} />
    {tenantId ? <input type="hidden" name="tenantId" value={tenantId} /> : null}
    {canRetry ? <button type="submit" name="resolution" value="retry" className="rounded-field border border-line px-3 py-2">Tentar novamente</button> : null}
    <button type="submit" name="resolution" value="completed" className="rounded-field border border-line px-3 py-2">Marcar como tratado</button>
  </form>;
}
