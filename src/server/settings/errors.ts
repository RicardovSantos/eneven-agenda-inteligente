export type SettingsErrorCode = "validation" | "forbidden";

export const FORBIDDEN_MESSAGE =
  "Só o proprietário pode alterar as configurações.";

/** Erro de configurações com mensagem em português para exibir na tela. */
export class SettingsError extends Error {
  readonly code: SettingsErrorCode;
  /** Mensagens por campo (chave = `name` do campo no formulário). */
  readonly fieldErrors?: Record<string, string>;

  constructor(
    code: SettingsErrorCode,
    message: string,
    fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "SettingsError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function validationError(fieldErrors: Record<string, string>): SettingsError {
  const first = Object.values(fieldErrors)[0] ?? "Dados inválidos.";
  return new SettingsError("validation", first, fieldErrors);
}
