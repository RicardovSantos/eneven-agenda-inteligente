export type CatalogErrorCode = "validation" | "forbidden" | "not_found";

export const FORBIDDEN_MESSAGE = "Só o proprietário pode alterar serviços e equipe.";
export const NOT_FOUND_MESSAGE = "Não encontramos este item. Atualize a página e tente de novo.";

/** Erro de serviços/equipe com mensagem em português para exibir na tela. */
export class CatalogError extends Error {
  readonly code: CatalogErrorCode;
  /** Mensagens por campo (chave = nome do campo do formulário). */
  readonly fieldErrors?: Record<string, string>;

  constructor(code: CatalogErrorCode, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "CatalogError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function validationError(fieldErrors: Record<string, string>): CatalogError {
  const first = Object.values(fieldErrors)[0] ?? "Dados inválidos.";
  return new CatalogError("validation", first, fieldErrors);
}

export const notFoundError = () => new CatalogError("not_found", NOT_FOUND_MESSAGE);
