"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enablePushForDevice } from "@/lib/push-subscription";
import { registerDevice, removeDevice } from "./actions";

export function DeviceControls({ publicKey, support }: { publicKey: string | null; support: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function activate() {
    if (!publicKey) return;
    setBusy(true); setMessage("");
    try {
      const result = await enablePushForDevice(publicKey, registerDevice);
      setMessage(result === "denied" ? "Permissão não concedida. Confira as configurações do navegador." : "Dispositivo cadastrado. O envio de notificações ainda está em preparação.");
      if (result === "enabled") router.refresh();
    } catch {
      setMessage("Não foi possível cadastrar este dispositivo. Confira a permissão do navegador e tente novamente.");
    } finally { setBusy(false); }
  }
  async function deactivate() {
    setBusy(true); setMessage("");
    try {
      if (!("serviceWorker" in navigator)) throw new Error();
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) { setMessage("Este navegador não possui inscrição de notificações."); return; }
      await removeDevice(subscription.toJSON());
      if (!await subscription.unsubscribe()) throw new Error();
      setMessage("Dispositivo removido das notificações.");
      router.refresh();
    } catch {
      setMessage("Não foi possível concluir a remoção neste dispositivo. Tente novamente.");
    } finally { setBusy(false); }
  }
  return <div className="space-y-4">
    {support ? <p className="text-sm text-ink-muted">O cadastro de dispositivos não está disponível no modo suporte.</p> : !publicKey ? <p className="text-sm text-ink-muted">As notificações ainda não estão disponíveis para configuração.</p> : <div className="flex flex-wrap gap-3">
      <button type="button" onClick={activate} disabled={busy} className="min-h-11 rounded-field bg-primary px-4 font-semibold text-white disabled:opacity-50">Cadastrar este dispositivo</button>
      <button type="button" onClick={deactivate} disabled={busy} className="min-h-11 rounded-field border border-line px-4 font-semibold text-ink disabled:opacity-50">Remover dispositivo</button>
    </div>}
    <p role="status" className="text-sm text-ink-muted">{message}</p>
  </div>;
}
