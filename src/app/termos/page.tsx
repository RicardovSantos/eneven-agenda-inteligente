import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { buildTermsDocument, getLegalContext } from "@/content/legal";

export const metadata: Metadata = { title: "Termos de uso" };

// Os dados do responsável vêm de variáveis de ambiente lidas na hora, não no build.
export const dynamic = "force-dynamic";

export default function TermosPage() {
  return (
    <LegalPage
      doc={buildTermsDocument(getLegalContext())}
      other={{ href: "/privacidade", label: "Política de privacidade" }}
    />
  );
}
