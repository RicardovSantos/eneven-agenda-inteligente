export type AuthErrorCode = "validation" | "email_taken" | "unavailable";

/** Erro de domínio da autenticação, com mensagem pronta para a interface (pt-BR). */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: AuthErrorCode,
    /** Mensagens por campo (só em `validation` e `email_taken`). */
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = "AuthError";
  }
}
