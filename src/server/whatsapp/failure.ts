const MAX_REASON = 300;

/** Tira de um texto de erro da Meta o que identifica pessoas: telefones, e-mails e links. */
export function sanitizeMetaError(message: string): string {
  return message
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[e-mail]")
    .replace(/(?<!\d)(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}(?!\d)/g, "[telefone]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_REASON);
}

/** Código e motivo de uma recusa de envio, prontos para log e para a ocorrência. */
export function describeSendFailure(failure: { error: string; code?: string; subcode?: number }) {
  const code = [failure.code, failure.subcode].filter((part) => part !== undefined && part !== "").join("/") || null;
  return { code, reason: sanitizeMetaError(failure.error) };
}
