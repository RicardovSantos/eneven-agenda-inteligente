"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { applyThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** O tema que está valendo agora: a escolha salva (classe no <html>) ou, sem ela, o do aparelho. */
function isDarkNow(): boolean {
  const root = document.documentElement;
  if (root.classList.contains("dark")) return true;
  if (root.classList.contains("light")) return false;
  return window.matchMedia(DARK_QUERY).matches;
}

function subscribe(notify: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", notify);
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => {
    media.removeEventListener("change", notify);
    observer.disconnect();
  };
}

/**
 * Botão sol/lua da página de agendamento. Começa no tema do aparelho do cliente;
 * tocar troca para o outro e lembra a escolha neste aparelho. Escuro mostra o sol
 * (para ir ao claro), claro mostra a lua (para ir ao escuro).
 *
 * Os dois ícones ficam empilhados e a troca é só CSS (`dark:` segue a mesma regra do
 * tema), então a página já abre com o ícone certo, sem piscar; ao tocar, um gira e
 * some enquanto o outro gira e aparece.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const dark = useSyncExternalStore(subscribe, isDarkNow, () => false);
  const target = dark ? "claro" : "escuro";
  const icon =
    "absolute size-[22px] transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)] motion-reduce:transition-none";

  return (
    <button
      type="button"
      onClick={() => applyThemePreference(isDarkNow() ? "light" : "dark")}
      aria-label={`Mudar para o tema ${target}`}
      title={`Tema ${target}`}
      className={cn(
        "relative grid size-11 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full border border-line bg-surface text-foreground outline-none transition-colors hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--brand) active:scale-95",
        className,
      )}
    >
      <Sun
        aria-hidden="true"
        className={cn(icon, "-rotate-90 scale-50 opacity-0 dark:rotate-0 dark:scale-100 dark:opacity-100")}
      />
      <Moon
        aria-hidden="true"
        className={cn(icon, "rotate-0 scale-100 opacity-100 dark:rotate-90 dark:scale-50 dark:opacity-0")}
      />
    </button>
  );
}
