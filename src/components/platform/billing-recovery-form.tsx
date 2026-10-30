"use client";

import { useActionState } from "react";
import { abandonSubscriptionAction, recoverSubscriptionAction } from "@/app/admin/cobranca/actions";

export function BillingRecoveryForm({ subscriptionId }: { subscriptionId: string }) {
  const [message, action, pending] = useActionState(recoverSubscriptionAction, "");
  return <div className="space-y-3"><form action={action} className="flex flex-wrap items-end gap-2">
    <input type="hidden" name="subscriptionId" value={subscriptionId} />
    <label className="flex flex-col gap-1 text-sm">ID da assinatura no Mercado Pago<input name="providerId" required maxLength={200} className="rounded-field border border-line bg-surface px-3 py-2" /></label>
    <button type="submit" disabled={pending} className="rounded-field border border-line px-3 py-2 disabled:opacity-50">{pending ? "Conferindo..." : "Conferir e recuperar"}</button>
    {message ? <p role="status" className="w-full text-sm">{message}</p> : null}
  </form>
  <form action={abandonSubscriptionAction} onSubmit={(event) => { if (!window.confirm("Confirme que você verificou no Mercado Pago que não existe assinatura para esta referência. Esta ação libera nova tentativa e não cancela nenhuma assinatura no provedor. Continuar?")) event.preventDefault(); }}>
    <input type="hidden" name="subscriptionId" value={subscriptionId} />
    <button type="submit" className="rounded-field border border-line px-3 py-2">Confirmar ausência e liberar nova tentativa</button>
  </form></div>;
}
