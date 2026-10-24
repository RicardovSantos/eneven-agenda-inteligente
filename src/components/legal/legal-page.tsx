import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand/logo";
import {
  LEGAL_LAST_UPDATED,
  formatLegalDate,
  type LegalBlock,
  type LegalDocument,
} from "@/content/legal";
import { BackLink } from "./back-link";

const EMAIL = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/;

/** Texto corrido: `**destaque**` vira negrito e e-mails viram links `mailto:`. */
function Inline({ text }: { text: string }) {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return (
      <Fragment key={index}>
        {part.split(EMAIL).map((piece, i) =>
          i % 2 === 1 ? (
            <a
              key={i}
              href={`mailto:${piece}`}
              className="text-primary underline underline-offset-2"
            >
              {piece}
            </a>
          ) : (
            piece
          ),
        )}
      </Fragment>
    );
  });
}

function Block({ block }: { block: LegalBlock }): ReactNode {
  if (block.type === "p") {
    return (
      <p>
        <Inline text={block.text} />
      </p>
    );
  }
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-ink-muted">
      {block.items.map((item) => (
        <li key={item} className="pl-1">
          <Inline text={item} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Página de leitura dos textos legais: coluna de 68ch, logo no topo, link
 * "Voltar", título em Outfit (herdado dos títulos), corpo em Figtree.
 */
export function LegalPage({
  doc,
  other,
}: {
  doc: LegalDocument;
  /** Link para o outro texto legal, no fim da página. */
  other: { href: string; label: string };
}) {
  return (
    <div className="min-h-dvh bg-canvas px-6 pb-16 pt-6 sm:pt-8">
      <div className="mx-auto w-full max-w-[68ch]">
        <header className="flex flex-col gap-3">
          <BrandLogo width={140} priority />
          <BackLink fallbackHref="/cadastro" />
        </header>

        <main className="mt-6 flex flex-col gap-8 text-base leading-relaxed">
          <div className="flex flex-col gap-2">
            <h1 className="text-[1.75rem] font-semibold">{doc.title}</h1>
            <p className="text-sm text-ink-muted">
              Última atualização: {formatLegalDate(LEGAL_LAST_UPDATED)}
            </p>
          </div>

          {doc.intro.map((block, index) => (
            <Block key={index} block={block} />
          ))}

          {doc.sections.map((section) => (
            <section key={section.heading} className="flex flex-col gap-3">
              <h2 className="text-[1.375rem] font-semibold">{section.heading}</h2>
              {section.blocks.map((block, index) => (
                <Block key={index} block={block} />
              ))}
            </section>
          ))}
        </main>

        <footer className="mt-12 border-t border-line pt-6 text-sm text-ink-muted">
          Veja também:{" "}
          <Link
            href={other.href}
            className="font-medium text-primary underline underline-offset-2"
          >
            {other.label}
          </Link>
        </footer>
      </div>
    </div>
  );
}
