"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

/** "G" colorido oficial do Google (18 px). */
function GoogleLogo() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

const LABELS = {
  login: "Entrar com Google",
  signup: "Criar conta com Google",
} as const;

/**
 * Botão do Google (variante clara oficial: fica branco também no tema
 * escuro). É um link para `/api/auth/google`, que redireciona ao Google; ao
 * clicar fica desabilitado com spinner até a página sair.
 */
export function GoogleButton({ intent }: { intent: "login" | "signup" }) {
  const [pending, setPending] = useState(false);

  // Voltar com o botão do navegador restaura a página (cache) ainda "enviando".
  useEffect(() => {
    const reset = () => setPending(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  return (
    <a
      href={`/api/auth/google?intent=${intent}`}
      aria-disabled={pending || undefined}
      onClick={(event) => {
        if (pending) event.preventDefault();
        else setPending(true);
      }}
      className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-field border border-[#dadce0] bg-white px-4 text-base font-medium text-[#1f1f1f] transition-colors hover:bg-[#f8f9fa] aria-disabled:pointer-events-none aria-disabled:opacity-70"
    >
      {pending ? (
        <>
          <Loader2 className="size-[18px] animate-spin" aria-hidden="true" />
          <span role="status">Conectando ao Google…</span>
        </>
      ) : (
        <>
          <GoogleLogo />
          {LABELS[intent]}
        </>
      )}
    </a>
  );
}

/** Divisor "ou" seguido do botão do Google (vai logo abaixo do formulário). */
export function GoogleSection({ intent }: { intent: "login" | "signup" }) {
  return (
    <div className="flex flex-col gap-6">
      <div
        className="flex items-center gap-3 text-[0.8125rem] text-ink-muted"
        role="separator"
      >
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
        ou
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
      </div>
      <GoogleButton intent={intent} />
    </div>
  );
}
