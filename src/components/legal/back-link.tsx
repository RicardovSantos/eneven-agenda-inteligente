"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * "Voltar": se a pessoa veio de outra tela do próprio site (ex.: o cadastro),
 * volta nela, mantendo o que ela já digitou. Aberta direto (link, nova aba),
 * leva para `fallbackHref`.
 */
export function BackLink({ fallbackHref }: { fallbackHref: string }) {
  const router = useRouter();

  return (
    <Link
      href={fallbackHref}
      onClick={(event) => {
        let sameSite = false;
        try {
          sameSite =
            window.history.length > 1 &&
            new URL(document.referrer).origin === window.location.origin;
        } catch {
          // Sem referrer ou inválido: usa o link normal.
        }
        if (sameSite) {
          event.preventDefault();
          router.back();
        }
      }}
      className="-ml-2 inline-flex h-11 items-center gap-1 rounded-field px-2 text-sm font-medium text-primary underline-offset-2 hover:underline"
    >
      <ChevronLeft className="size-5" aria-hidden="true" />
      Voltar
    </Link>
  );
}
