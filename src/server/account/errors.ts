export type AccountDeletionErrorCode =
  | "confirmation"
  | "password"
  | "forbidden"
  | "super_admin"
  | "billing"
  | "not_found";

/** Erro com mensagem pronta para a tela (sem detalhes internos). */
export class AccountDeletionError extends Error {
  constructor(
    readonly code: AccountDeletionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AccountDeletionError";
  }
}

/** Palavra que a pessoa digita para confirmar a exclusão. */
export const DELETE_CONFIRMATION_WORD = "EXCLUIR";
