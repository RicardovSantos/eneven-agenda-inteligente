import Image from "next/image";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

const LOGO_RATIO = 1672 / 585;

/**
 * Logo horizontal (link para `/`). No tema escuro troca para `logo-dark.png`
 * (texto claro, sem plaquinha). São duas imagens alternadas pela variante
 * `dark:` do Tailwind, que segue `prefers-color-scheme` e também a classe
 * `.dark` (um `<picture>` só respeitaria o sistema). A escura é `lazy`: o
 * navegador só a baixa quando ela passa a aparecer (tema escuro), então quem
 * usa o tema claro não paga por ela.
 */
export function BrandLogo({
  width,
  className,
  priority = false,
}: {
  /** Largura em px (a altura segue a proporção da logo). */
  width: number;
  className?: string;
  priority?: boolean;
}) {
  const size = {
    width,
    height: Math.round(width / LOGO_RATIO),
    style: { width, height: "auto" },
  } as const;

  return (
    <Link
      href="/"
      aria-label={`${PRODUCT_NAME}, página inicial`}
      className={cn("inline-block rounded-field", className)}
    >
      <Image
        src="/brand/logo.png"
        alt={PRODUCT_NAME}
        priority={priority}
        className="dark:hidden"
        {...size}
      />
      {/* Decorativa: o nome já está no `alt` da outra e no `aria-label` do link. */}
      <Image
        src="/brand/logo-dark.png"
        alt=""
        aria-hidden="true"
        loading="lazy"
        className="hidden dark:block"
        {...size}
      />
    </Link>
  );
}
