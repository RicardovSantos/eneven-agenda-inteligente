/** Endereço padrão da API: o host que o painel do agente "Eneven-Agenda" mostra. */
const DEFAULT_ZEPTOMAIL_URL = "https://cpaas.zoho.com/v1.1/email";
/** O painel do ZeptoMail entrega o token já com este prefixo; aceitamos com ou sem. */
const TOKEN_PREFIX = "Zoho-enczapikey";
const SENDER_NAME = "Eneven Agenda";
const TIMEOUT_MS = 10_000;

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  /** Versão em texto puro (`textbody`). */
  text?: string;
};

/** Erro da API de e-mail, com o status HTTP (o chamador decide se engole). */
export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "EmailSendError";
  }
}

const LINK_PATTERN = /https?:\/\/[^\s"'<>]+/;

/** Token sem espaços nas pontas e sem o prefixo `Zoho-enczapikey `. */
function normalizeToken(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.toLowerCase().startsWith(TOKEN_PREFIX.toLowerCase())
    ? trimmed.slice(TOKEN_PREFIX.length).trim()
    : trimmed;
}

/** `ZEPTOMAIL_URL` (padrão acima). Precisa ser https: o token vai no cabeçalho. */
function apiUrl(): string {
  const configured = process.env.ZEPTOMAIL_URL?.trim() || DEFAULT_ZEPTOMAIL_URL;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new EmailSendError("ZEPTOMAIL_URL inválido. Informe o endereço completo da API.");
  }
  if (url.protocol !== "https:") {
    throw new EmailSendError("ZEPTOMAIL_URL precisa começar com https://.");
  }
  return url.toString();
}

/**
 * Envia um e-mail transacional pelo ZeptoMail.
 *
 * Sem `ZEPTOMAIL_TOKEN` (desenvolvimento e testes) nada é enviado: só o
 * assunto e o link do e-mail vão para o console. Em produção a falta do token
 * é erro (e o link nunca vai para o log). Resposta fora de 2xx lança
 * `EmailSendError` com o status.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const token = normalizeToken(process.env.ZEPTOMAIL_TOKEN ?? "");

  if (!token) {
    if (process.env.NODE_ENV === "production") {
      throw new EmailSendError("ZEPTOMAIL_TOKEN não definido. Configure o envio de e-mails.");
    }
    const link = (message.text ?? message.html).match(LINK_PATTERN)?.[0] ?? "(sem link)";
    console.info(`[e-mail] ${message.subject} | ${link}`);
    return;
  }

  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new EmailSendError("EMAIL_FROM não definido. Configure o remetente dos e-mails.");
  }

  const response = await fetch(apiUrl(), {
    method: "POST",
    headers: {
      Authorization: `${TOKEN_PREFIX} ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      from: { address: from, name: SENDER_NAME },
      to: [{ email_address: { address: message.to } }],
      subject: message.subject,
      htmlbody: message.html,
      textbody: message.text,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new EmailSendError(
      `ZeptoMail respondeu ${response.status}${detail ? `: ${detail}` : ""}`,
      response.status,
    );
  }
}
