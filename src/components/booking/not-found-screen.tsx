import Link from "next/link";
import { BrandLogo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";

/** 404 das páginas públicas, com a marca Eneven (o estabelecimento não é conhecido aqui). */
export function NotFoundScreen({ title, text }: { title: string; text: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-canvas px-5 py-16 text-center">
      <BrandLogo width={180} priority />
      <div className="flex flex-col gap-2">
        <h1 className="m-0 font-display text-[1.375rem] font-semibold">{title}</h1>
        <p className="m-0 text-[0.9375rem] text-ink-muted">{text}</p>
      </div>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        Ir para a página inicial
      </Link>
    </main>
  );
}
