import { describe, expect, it } from "vitest";
import {
  LEGAL_LAST_UPDATED,
  buildPrivacyDocument,
  buildTermsDocument,
  formatLegalDate,
  getLegalContext,
  type LegalDocument,
} from "@/content/legal";

const text = (doc: LegalDocument) => JSON.stringify(doc);

describe("getLegalContext", () => {
  it("sem variáveis usa os padrões e omite o documento", () => {
    expect(getLegalContext({})).toEqual({
      ownerName: "Ricardo Santos",
      ownerDoc: "",
      contactEmail: "eneventech@gmail.com",
    });
  });

  it("variáveis vazias ou só com espaços também caem no padrão", () => {
    expect(
      getLegalContext({ LEGAL_OWNER_NAME: "  ", LEGAL_CONTACT_EMAIL: "", LEGAL_OWNER_DOC: " " }),
    ).toEqual({ ownerName: "Ricardo Santos", ownerDoc: "", contactEmail: "eneventech@gmail.com" });
  });

  it("lê as três variáveis, sem espaços nas pontas", () => {
    expect(
      getLegalContext({
        LEGAL_OWNER_NAME: " Maria Souza ",
        LEGAL_OWNER_DOC: " CPF 123.456.789-00 ",
        LEGAL_CONTACT_EMAIL: " contato@eneven.com.br ",
      }),
    ).toEqual({
      ownerName: "Maria Souza",
      ownerDoc: "CPF 123.456.789-00",
      contactEmail: "contato@eneven.com.br",
    });
  });
});

describe("formatLegalDate / LEGAL_LAST_UPDATED", () => {
  it("formata AAAA-MM-DD como dd/mm/aaaa", () => {
    expect(formatLegalDate("2026-10-24")).toBe("24/10/2026");
    expect(formatLegalDate("2027-01-05")).toBe("05/01/2027");
  });

  it("a constante é uma data válida", () => {
    expect(LEGAL_LAST_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(LEGAL_LAST_UPDATED))).toBe(false);
  });
});

describe("termos de uso", () => {
  const terms = buildTermsDocument(getLegalContext({}));

  it("tem as 11 seções do texto original, na ordem", () => {
    expect(terms.title).toBe("Termos de uso");
    expect(terms.sections.map((s) => s.heading)).toEqual([
      "1. Quem somos",
      "2. O que a plataforma faz",
      "3. Conta do estabelecimento",
      "4. Teste grátis, planos e pagamento",
      "5. Mensagens de lembrete",
      "6. Uso permitido",
      "7. Disponibilidade",
      "8. Dados e propriedade",
      "9. Responsabilidade",
      "10. Alterações",
      "11. Lei e foro",
    ]);
  });

  it("preenche o responsável e o contato (documento omitido quando vazio)", () => {
    expect(text(terms)).toContain(
      "sob responsabilidade de Ricardo Santos, contato eneventech@gmail.com.",
    );
    expect(text(terms)).not.toContain("()");
  });

  it("inclui o documento entre parênteses quando LEGAL_OWNER_DOC existe", () => {
    const withDoc = buildTermsDocument(
      getLegalContext({ LEGAL_OWNER_DOC: "CPF 123.456.789-00", LEGAL_OWNER_NAME: "Maria Souza" }),
    );
    expect(text(withDoc)).toContain(
      "sob responsabilidade de Maria Souza (CPF 123.456.789-00), contato eneventech@gmail.com.",
    );
  });

  it("mantém listas e destaques do original", () => {
    const trial = terms.sections.find((s) => s.heading.startsWith("4."))!;
    const list = trial.blocks.find((b) => b.type === "ul");
    expect(list && list.type === "ul" && list.items).toHaveLength(4);
    expect(text(terms)).toContain("30 dias de teste grátis");
  });
});

describe("política de privacidade", () => {
  const privacy = buildPrivacyDocument(getLegalContext({ LEGAL_CONTACT_EMAIL: "lgpd@eneven.com.br" }));

  it("tem as 10 seções do texto original, na ordem", () => {
    expect(privacy.title).toBe("Política de privacidade");
    expect(privacy.sections.map((s) => s.heading)).toEqual([
      "1. Papéis",
      "2. Dados que coletamos",
      "3. Para que usamos",
      "4. Compartilhamento",
      "5. Por quanto tempo guardamos",
      "6. Segurança",
      "7. Seus direitos",
      "8. Cookies",
      "9. Contato",
      "10. Alterações",
    ]);
  });

  it("abre com a frase sobre a LGPD", () => {
    expect(text(privacy)).toContain("Lei Geral de Proteção de Dados (Lei 13.709/2018 — LGPD)");
  });

  it("usa o e-mail de contato nos direitos e no encarregado (DPO)", () => {
    expect(text(privacy)).toContain("também podem escrever para lgpd@eneven.com.br");
    expect(text(privacy)).toContain("Encarregado de dados (DPO): Ricardo Santos — lgpd@eneven.com.br.");
  });
});

describe("os dois documentos", () => {
  const ctx = getLegalContext({});
  for (const [name, doc] of [
    ["termos", buildTermsDocument(ctx)],
    ["privacidade", buildPrivacyDocument(ctx)],
  ] as const) {
    it(`${name}: sem placeholder entre colchetes, sem variável e sem a nota do editor`, () => {
      const all = text(doc);
      expect(all).not.toMatch(/\[[A-Z_]+/);
      expect(all).not.toContain("LEGAL_");
      expect(all).not.toContain("{{");
      expect(all).not.toMatch(/rascunho|advogado/i);
    });
  }
});
