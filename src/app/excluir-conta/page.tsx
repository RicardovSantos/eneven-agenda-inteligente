import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { buildAccountDeletionDocument, getLegalContext } from "@/content/legal";

export const metadata: Metadata = { title: "Excluir conta e dados" };

// O contato vem de variáveis de ambiente lidas na hora, não no build.
export const dynamic = "force-dynamic";

/** Página pública que a Google Play pede para a exclusão de conta (link no Play Console). */
export default function ExcluirContaPublicaPage() {
  return (
    <LegalPage
      doc={buildAccountDeletionDocument(getLegalContext())}
      other={{ href: "/privacidade", label: "Política de privacidade" }}
    />
  );
}
