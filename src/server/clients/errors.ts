export type ClientErrorCode = "not_found" | "phone_taken" | "forbidden" | "validation";

const MESSAGES: Record<ClientErrorCode, string> = {
  not_found: "Cliente não encontrado.",
  phone_taken: "Já existe um cliente com esse WhatsApp.",
  forbidden: "Você não tem permissão para fazer isso.",
  validation: "Confira os dados informados.",
};

type Extra = { existingId?: string; fieldErrors?: Record<string, string> };

export class ClientError extends Error {
  readonly code: ClientErrorCode;
  /** `phone_taken`: o cliente que já usa o WhatsApp. */
  readonly existingId?: string;
  /** `validation`: mensagem por campo (`name`, `phone`, `email`, `notes`). */
  readonly fieldErrors?: Record<string, string>;

  constructor(code: ClientErrorCode, message?: string, extra: Extra = {}) {
    super(message ?? MESSAGES[code]);
    this.name = "ClientError";
    this.code = code;
    this.existingId = extra.existingId;
    this.fieldErrors = extra.fieldErrors;
  }
}
