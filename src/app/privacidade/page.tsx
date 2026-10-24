import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { buildPrivacyDocument, getLegalContext } from "@/content/legal";

export const metadata: Metadata = { title: "Política de privacidade" };

// Os dados do responsável vêm de variáveis de ambiente lidas na hora, não no build.
export const dynamic = "force-dynamic";

export default function PrivacidadePage() {
  return (
    <LegalPage
      doc={buildPrivacyDocument(getLegalContext())}
      other={{ href: "/termos", label: "Termos de uso" }}
    />
  );
}
