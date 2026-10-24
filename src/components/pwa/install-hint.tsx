"use client";

import { X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

const DISMISSED_KEY = "eneven:install-hint-dismissed";

/** Evento do Chrome/Android que ainda não está nos tipos do TypeScript. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Navegação privada ou armazenamento bloqueado: some só nesta visita.
  }
}

function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

/** iPhone/iPad no Safari (os outros navegadores do iOS não têm "Adicionar à Tela de Início" confiável). */
function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIos =
    /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
  return isIos && !isOtherBrowser;
}

const noopSubscribe = () => () => {};

/** Pode oferecer a instalação neste aparelho? (nunca no servidor: o HTML inicial não tem a faixa). */
function canOfferInstall(): boolean {
  return !wasDismissed() && !isStandalone();
}

/**
 * Faixa discreta que convida a instalar o app: botão "Instalar app" onde o
 * navegador oferece (Android/Chrome) e instrução no iPhone. Some se o app já
 * está instalado e, ao ser dispensada, não volta.
 */
export function InstallHint() {
  const showIosHint = useSyncExternalStore(
    noopSubscribe,
    () => canOfferInstall() && isIosSafari(),
    () => false,
  );
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      // Guardamos o evento para abrir o diálogo só quando a pessoa tocar em "Instalar app".
      event.preventDefault();
      if (canOfferInstall()) setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setClosed(true);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const mode = closed ? "hidden" : installEvent ? "android" : showIosHint ? "ios" : "hidden";
  if (mode === "hidden") return null;

  function dismiss() {
    rememberDismissed();
    setClosed(true);
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") setClosed(true);
    else dismiss();
  }

  return (
    <div
      role="region"
      aria-label="Instalar o aplicativo"
      className="fixed inset-x-3 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.5rem)] z-10 flex items-center gap-2 rounded-panel border border-line bg-surface py-2 pl-4 pr-1 shadow-float lg:inset-x-auto lg:bottom-4 lg:right-8 lg:max-w-md"
    >
      <p className="min-w-0 flex-1 text-sm leading-snug text-ink">
        {mode === "android"
          ? "Instale o app no celular para abrir a agenda com um toque."
          : "Toque em Compartilhar e depois em Adicionar à Tela de Início."}
      </p>
      {mode === "android" ? (
        <button
          type="button"
          onClick={install}
          className="h-11 shrink-0 rounded-field bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Instalar app
        </button>
      ) : null}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dispensar"
        className="flex size-11 shrink-0 items-center justify-center rounded-field text-ink-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <X className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}
