import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Tela de mensagem simples (resultado de um link): título, texto e um botão. */
export function AuthMessage({
  title,
  text,
  actionLabel,
  href,
}: {
  title: string;
  text: string;
  actionLabel: string;
  href: string;
}) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-[1.75rem] font-semibold">{title}</h1>
        <p className="text-ink-muted">{text}</p>
      </div>
      <Link href={href} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
        {actionLabel}
      </Link>
    </div>
  );
}
