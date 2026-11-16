"use client";

import { BellRing } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { checkDevice, registerDevice } from "@/app/painel/configuracoes/notificacoes/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { healPushDevice } from "@/lib/push-keeper";
import { renewPushForDevice } from "@/lib/push-subscription";

const RECHECK_MS = 20 * 60_000;

/**
 * Renova sozinho, ao abrir o painel, o aviso de um aparelho que o serviço de notificações recusou.
 * Se o navegador exigir um toque (iOS), mostra uma faixa "Reativar notificações".
 */
export function PushKeeper({ publicKey }: { publicKey: string }) {
  const toast = useToast();
  const [needsTap, setNeedsTap] = useState(false);
  const [busy, setBusy] = useState(false);
  const lastRun = useRef(0);

  const run = useCallback(async () => {
    if (Date.now() - lastRun.current < RECHECK_MS) return;
    lastRun.current = Date.now();
    const result = await healPushDevice({
      permission: () => (typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window ? Notification.permission : "unsupported"),
      current: async () => (await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription())?.toJSON() ?? null,
      status: checkDevice,
      renew: () => renewPushForDevice(publicKey, registerDevice),
    });
    setNeedsTap(result === "needs-tap");
  }, [publicKey]);

  useEffect(() => {
    void run();
    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [run]);

  async function reactivate() {
    setBusy(true);
    try {
      await renewPushForDevice(publicKey, registerDevice);
      setNeedsTap(false);
      toast.show("Notificações reativadas neste aparelho");
    } catch {
      toast.show("Não foi possível reativar. Confira a permissão de notificações do aparelho.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!needsTap) return null;
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-field border border-primary/30 bg-primary-soft px-4 py-3 text-sm">
      <BellRing className="size-5 shrink-0 text-primary" aria-hidden="true" />
      <p className="m-0 min-w-0 flex-1 leading-snug">As notificações pararam de chegar neste aparelho. Toque para reativar.</p>
      <Button type="button" onClick={reactivate} disabled={busy} className="min-h-11">
        Reativar notificações
      </Button>
    </div>
  );
}
