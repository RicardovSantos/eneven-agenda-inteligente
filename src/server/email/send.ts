const ZEPTOMAIL_URL = "https://api.zeptomail.com/v1.1/email";
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

/**
 * Envia um e-mail transacional pelo ZeptoMail.
 *
 * Sem `ZEPTOMAIL_TOKEN` (desenvolvimento e testes) nada é enviado: só o
 * assunto e o link do e-mail vão para o console. Resposta fora de 2xx lança
 * `EmailSendError` com o status.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const token = process.env.ZEPTOMAIL_TOKEN;

  if (!token) {
    const link = (message.text ?? message.html).match(LINK_PATTERN)?.[0] ?? "(sem link)";
    console.info(`[e-mail] ${message.subject} | ${link}`);
    return;
  }

  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new EmailSendError("EMAIL_FROM não definido. Configure o remetente dos e-mails.");
  }

  const response = await fetch(ZEPTOMAIL_URL, {
    method: "POST",
    headers: {
      Authorization: `Zoho-enczapikey ${token}`,
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
