import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const LOGO_RATIO = 1672 / 585;

/**
 * Logo horizontal (link para `/`). O traço escuro da logo some no tema escuro,
 * então ali ela ganha uma plaquinha clara.
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
  return (
    <Link
      href="/"
      aria-label="Eneven Agendamentos Inteligentes, página inicial"
      className={cn(
        "inline-block rounded-field dark:bg-[#f7f6fc] dark:px-2 dark:py-1.5",
        className,
      )}
    >
      <Image
        src="/brand/logo.png"
        alt="Eneven Agendamentos Inteligentes"
        width={width}
        height={Math.round(width / LOGO_RATIO)}
        priority={priority}
        style={{ width, height: "auto" }}
      />
    </Link>
  );
}
