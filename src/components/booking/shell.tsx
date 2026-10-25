import type { CSSProperties, ReactNode } from "react";
import { initialsOf } from "@/lib/initial";
import { cn } from "@/lib/utils";

/** Dados do estabelecimento que as telas públicas usam (tudo já pronto para exibir). */
export type BookingTenant = {
  slug: string;
  name: string;
  /** Já com contraste AA sobre texto branco. */
  brandColor: string;
  logoUrl: string | null;
  /** Só dígitos com `55`. */
  whatsapp: string | null;
  address: string | null;
  /** "Rua X, 120 · Aberto hoje até 19h". */
  subtitle: string | null;
  timezone: string;
};

export function whatsappUrl(digits: string): string {
  return `https://wa.me/${digits}`;
}

/**
 * Coluna da página pública: a cor da marca do salão vira `--brand` (usada nos
 * botões, pílulas e seleções no lugar do `--primary`). Largura de celular,
 * centralizada no computador.
 */
export function PublicShell({
  brandColor,
  children,
  className,
}: {
  brandColor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex-1 bg-canvas">
      <div
        style={{ "--brand": brandColor } as CSSProperties}
        className={cn(
          "mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-surface text-foreground sm:border-x sm:border-line",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Logo do salão ou, sem logo, as iniciais sobre a cor da marca. */
export function BrandMark({
  name,
  logoUrl,
  size,
}: {
  name: string;
  logoUrl: string | null;
  size: "lg" | "sm";
}) {
  const box = size === "lg" ? "size-14 rounded-2xl text-xl" : "size-9 rounded-[11px] text-sm";
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- logo servido por /api/logo (PNG 256 px, cache de 5 min)
      <img
        src={logoUrl}
        alt=""
        aria-hidden="true"
        width={size === "lg" ? 56 : 36}
        height={size === "lg" ? 56 : 36}
        className={cn("shrink-0 bg-canvas object-cover", box)}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center bg-(--brand) font-display font-bold text-white",
        box,
      )}
    >
      {initialsOf(name)}
    </div>
  );
}

/** Nome do salão com a marca (cabeçalho compacto dos passos 2 a 4, confirmação e gestão). */
export function CompactBrand({ tenant }: { tenant: BookingTenant }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <BrandMark name={tenant.name} logoUrl={tenant.logoUrl} size="sm" />
      <span className="truncate font-display text-[17px] font-semibold">{tenant.name}</span>
    </div>
  );
}

/** Botão cheio na cor da marca (50px) ou, com `variant="outline"`, o secundário. */
export const brandButton =
  "flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-(--brand) px-4 text-base font-semibold text-white no-underline transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50";

export const outlineButton =
  "flex min-h-12 w-full items-center justify-center rounded-xl border border-line bg-surface px-4 text-[0.9375rem] font-semibold text-foreground no-underline transition-colors hover:bg-primary-soft disabled:pointer-events-none disabled:opacity-50";

export const textLink =
  "flex min-h-11 items-center self-center px-2 text-sm text-ink-muted underline-offset-4 hover:text-foreground hover:underline";
