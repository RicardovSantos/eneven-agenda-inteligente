"use client";

import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { registerDevice } from "@/app/painel/configuracoes/notificacoes/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { enablePushForDevice } from "@/lib/push-subscription";
import { ONLY_IN_APP } from "@/lib/twa";

const DISMISSED_KEY = "eneven:push-prompt-dismissed";

type Need = "ask" | "blocked" | null;

function dismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Convite para ativar os avisos de novo agendamento, só dentro do app Android (TWA). No Android 13+ a
 * permissão de notificações é uma pergunta do sistema, que só aparece quando alguém pede; sem este convite o
 * dono só a veria em Configurações > Notificações. A permissão é pedida no toque do botão, nunca ao abrir.
 */
export function PushPrompt({ publicKey }: { publicKey: string }) {
  const toast = useToast();
  const [need, setNeed] = useState<Need>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (dismissed() || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
      const permission = Notification.permission;
      if (permission === "denied") return void (!cancelled && setNeed("blocked"));
      const subscription = await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription();
      // Permitido e já cadastrado: nada a pedir. Sem cadastro (ou ainda sem resposta): convida.
      if (!cancelled && !(permission === "granted" && subscription)) setNeed("ask");
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Sem armazenamento: some só até recarregar.
    }
    setNeed(null);
  }

  async function activate() {
    setBusy(true);
    try {
      const result = await enablePushForDevice(publicKey, registerDevice);
      if (result === "enabled") {
        toast.show("Notificações ativadas neste aparelho");
        setNeed(null);
      } else {
        setNeed("blocked");
      }
    } catch {
      toast.show("Não foi possível ativar agora. Tente novamente em Configurações > Notificações.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!need) return null;
  return (
    <div {...ONLY_IN_APP} role="status" className="mb-4 rounded-field border border-primary/30 bg-primary-soft px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <BellRing className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <p className="m-0 min-w-0 flex-1 leading-snug">
          {need === "ask"
            ? "Receba um aviso no celular a cada novo agendamento, cancelamento ou remarcação."
            : "As notificações estão bloqueadas. Para receber avisos de agendamento, ative em Configurações do Android > Apps > Eneven Agenda > Notificações."}
        </p>
        {need === "ask" ? (
          <Button type="button" onClick={activate} disabled={busy} className="min-h-11">
            Ativar notificações
          </Button>
        ) : null}
        <button type="button" onClick={dismiss} className="min-h-11 px-2 text-ink-muted underline">
          Agora não
        </button>
      </div>
    </div>
  );
}
