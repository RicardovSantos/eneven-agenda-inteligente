export type PlatformErrorCode =
  | "validation"
  | "not_found"
  | "email_taken"
  | "invalid_state"
  | "forbidden";

/** Erro de domínio das ações da plataforma, com mensagem pronta para a interface (pt-BR). */
export class PlatformError extends Error {
  readonly code: PlatformErrorCode;
  readonly fieldErrors?: Record<string, string>;

  constructor(code: PlatformErrorCode, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "PlatformError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const tenantNotFound = () =>
  new PlatformError("not_found", "Estabelecimento não encontrado.");
