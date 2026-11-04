"use client";

import { useState } from "react";

const FILE_NAME = "eneven-agenda.json";
const CLASSES = "flex min-h-11 w-full items-center justify-center rounded-field bg-primary px-5 text-center font-semibold text-primary-foreground disabled:opacity-60 sm:w-auto";

/**
 * Baixa os dados do estabelecimento sem sair do app. Um link `download` abre o
 * JSON em tela cheia no iPhone (app instalado), sem botão de voltar. Aqui o arquivo
 * é buscado em segundo plano e entregue pela folha de compartilhar (Salvar em
 * Arquivos, AirDrop...) no celular ou, no computador e quando ela falha, pelo download
 * normal do navegador.
 */
export function ExportDataButton() {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function run() {
    setState("loading");
    try {
      const response = await fetch("/api/painel/exportar-agenda", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const file = new File([blob], FILE_NAME, { type: "application/json" });
      // A folha de compartilhar só vale no celular/tablet (toque). No computador o Chrome
      // anuncia suporte, mas recusa depois da espera do arquivo: ali vale o download normal.
      const touch = window.matchMedia("(pointer: coarse)").matches;
      let shared = false;
      if (touch && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: FILE_NAME });
          shared = true;
        } catch (error) {
          // Fechar a folha de compartilhar não é erro e não baixa de novo.
          if (error instanceof DOMException && error.name === "AbortError") shared = true;
        }
      }
      if (!shared) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = FILE_NAME;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={run} disabled={state === "loading"} className={CLASSES}>
        {state === "loading" ? "Preparando o arquivo…" : "Baixar dados do estabelecimento"}
      </button>
      {state === "error" ? (
        <p role="alert" className="m-0 text-sm text-danger">
          Não foi possível baixar agora. Tente novamente ou fale com o suporte.
        </p>
      ) : null}
    </div>
  );
}
