"use client";

import { useCallback, useEffect, useState } from "react";

const CHECK_EVERY_MS = 30_000;

/**
 * Vigia da conta em uso. A sessão (cookie) é uma só para todas as abas: entrar
 * em outro estabelecimento, voltar à plataforma ou sair em outra aba muda a
 * conta desta aba sem que a tela perceba, e o que fosse salvo aqui iria para a
 * conta errada. Este componente confere ao voltar para a aba, ao focar a janela
 * e a cada 30 s; se a conta mudou, cobre a tela e pede para recarregar.
 *
 * No modo suporte ele também marca o título da aba e desenha um contorno fixo
 * na janela inteira, para o super-admin saber a qualquer momento em qual conta está.
 */
export function SessionContextWatcher({
  tenantId,
  support,
  tenantName,
}: {
  tenantId: string;
  support: boolean;
  tenantName: string;
}) {
  const [stale, setStale] = useState(false);

  const check = useCallback(async () => {
    try {
      const response = await fetch("/api/painel/contexto", { cache: "no-store", credentials: "same-origin" });
      if (response.status === 401) {
        setStale(true);
        return;
      }
      if (!response.ok) return;
      const now = (await response.json()) as { tenantId?: string; support?: boolean };
      if (now.tenantId !== tenantId || now.support !== support) setStale(true);
    } catch {
      // Sem rede não dá para conferir; a próxima checagem tenta de novo.
    }
  }, [tenantId, support]);

  useEffect(() => {
    const whenVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", whenVisible);
    window.addEventListener("focus", whenVisible);
    window.addEventListener("pageshow", whenVisible);
    const timer = window.setInterval(whenVisible, CHECK_EVERY_MS);
    return () => {
      document.removeEventListener("visibilitychange", whenVisible);
      window.removeEventListener("focus", whenVisible);
      window.removeEventListener("pageshow", whenVisible);
      window.clearInterval(timer);
    };
  }, [check]);

  // Título da aba: o Next troca o <title> a cada página, então o prefixo é reposto.
  useEffect(() => {
    if (!support) return;
    const prefix = `[SUPORTE · ${tenantName}] `;
    const apply = () => {
      if (!document.title.startsWith(prefix)) document.title = prefix + document.title;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (document.title.startsWith(prefix)) document.title = document.title.slice(prefix.length);
    };
  }, [support, tenantName]);

  return (
    <>
      {support ? (
        <div
          aria-hidden="true"
          data-support-frame=""
          className="pointer-events-none fixed inset-0 z-[60] border-4 border-amber-500"
        />
      ) : null}
      {stale ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="context-stale-title"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
        >
          <div className="w-full max-w-md rounded-card bg-surface p-6 text-foreground shadow-float">
            <h2 id="context-stale-title" className="font-display text-xl font-semibold">
              A conta mudou em outra aba
            </h2>
            <p className="mt-2 text-base text-ink-muted">
              Você entrou, saiu do modo suporte ou trocou de estabelecimento em outra aba. Recarregue esta
              tela para ver a conta certa; o que você mudar aqui antes disso não vale.
            </p>
            <button
              type="button"
              autoFocus
              onClick={() => window.location.reload()}
              className="mt-5 flex h-11 w-full cursor-pointer items-center justify-center rounded-field bg-ink px-4 font-semibold text-canvas outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Recarregar
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
