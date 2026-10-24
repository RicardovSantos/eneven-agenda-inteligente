/**
 * E-mails transacionais: HTML com estilos inline e layout em tabelas (funciona
 * no Gmail e no Outlook), sem fontes web. Todo texto que vem do usuário passa
 * por `escapeHtml`.
 */

export type EmailContent = { subject: string; html: string; text: string };

const COLORS = {
  page: "#F7F6FC",
  ink: "#29303C",
  muted: "#5E6475",
  primary: "#3E07D2",
  accent: "#9429F7",
};
const FONT = "Arial, Helvetica, sans-serif";
const FIO_GRADIENT = "linear-gradient(90deg,#3E07D2,#9429F7,#F581FB)";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * URL pública da aplicação, sem barra no final. Em produção `APP_URL` é
 * obrigatório: sem ele os links dos e-mails apontariam para localhost.
 *
 * Exceção: durante o `next build` (`NEXT_PHASE=phase-production-build`, que
 * roda com NODE_ENV=production) a ausência não lança, para `pnpm build`
 * funcionar localmente sem configurar nada. No Docker o build recebe
 * `APP_URL` (ARG) e o endereço entra no HTML estático; o servidor em
 * produção sempre confere.
 */
export function appUrl(): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    throw new Error("APP_URL não definido");
  }
  return "http://localhost:3000";
}

export const verifyLink = (token: string) =>
  `${appUrl()}/confirmar-email?token=${encodeURIComponent(token)}`;
export const resetLink = (token: string) =>
  `${appUrl()}/recuperar-senha/${encodeURIComponent(token)}`;

type Layout = {
  heading: string;
  /** Texto já escapado (pode conter `<strong>` próprio). */
  bodyHtml: string;
  buttonLabel: string;
  link: string;
  noteHtml: string;
};

function renderLayout({ heading, bodyHtml, buttonLabel, link, noteHtml }: Layout): string {
  const href = escapeHtml(link);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.page};">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="background:#FFFFFF;border-radius:16px;padding:32px;font-family:${FONT};color:${COLORS.ink};">
<img src="${escapeHtml(appUrl())}/brand/logo-email.png" width="160" alt="Eneven Agendamentos Inteligentes" style="display:block;width:160px;height:auto;border:0;outline:none;text-decoration:none;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 24px 0;"><tr><td width="120" height="3" style="width:120px;height:3px;font-size:0;line-height:0;border-radius:999px;background:${COLORS.accent};background-image:${FIO_GRADIENT};">&nbsp;</td></tr></table>
<h1 style="margin:0 0 16px 0;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:bold;color:${COLORS.ink};">${escapeHtml(heading)}</h1>
<p style="margin:0 0 24px 0;font-family:${FONT};font-size:16px;line-height:1.5;color:${COLORS.ink};">${bodyHtml}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;"><tr><td align="center" bgcolor="${COLORS.primary}" style="background:${COLORS.primary};border-radius:10px;"><a href="${href}" target="_blank" style="display:inline-block;padding:14px 24px;font-family:${FONT};font-size:16px;line-height:1.2;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:10px;">${escapeHtml(buttonLabel)}</a></td></tr></table>
<p style="margin:0 0 24px 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${COLORS.muted};word-break:break-all;">${href}</p>
<p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.5;color:${COLORS.ink};">${noteHtml}</p>
</td></tr>
<tr><td align="center" style="padding:16px 8px 0 8px;font-family:${FONT};font-size:12px;line-height:1.5;color:${COLORS.muted};">Eneven Agendamentos Inteligentes</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name.trim();

export function buildVerifyEmail(input: {
  name: string;
  businessName: string;
  link: string;
}): EmailContent {
  const subject = "Confirme seu e-mail na Eneven Agenda";
  const first = firstName(input.name);
  const body = `Olá, ${first}. Confirme seu e-mail para liberar o link de agendamento de ${input.businessName}.`;
  const note = "O link vale por 48 horas. Se você não criou esta conta, ignore este e-mail.";

  return {
    subject,
    html: renderLayout({
      heading: "Confirme seu e-mail",
      bodyHtml: escapeHtml(body),
      buttonLabel: "Confirmar e-mail",
      link: input.link,
      noteHtml: escapeHtml(note),
    }),
    text: [
      "Confirme seu e-mail",
      "",
      body,
      "",
      `Confirmar e-mail: ${input.link}`,
      "",
      note,
      "",
      "Eneven Agendamentos Inteligentes",
    ].join("\n"),
  };
}

export function buildResetEmail(input: { email: string; link: string }): EmailContent {
  const subject = "Redefinir sua senha da Eneven Agenda";
  const body = `Recebemos um pedido para criar uma nova senha para ${input.email}.`;
  const note =
    "O link vale por 1 hora. Se não foi você, ignore este e-mail: sua senha continua a mesma.";

  return {
    subject,
    html: renderLayout({
      heading: "Redefinir senha",
      bodyHtml: escapeHtml(body),
      buttonLabel: "Criar nova senha",
      link: input.link,
      noteHtml: escapeHtml(note),
    }),
    text: [
      "Redefinir senha",
      "",
      body,
      "",
      `Criar nova senha: ${input.link}`,
      "",
      note,
      "",
      "Eneven Agendamentos Inteligentes",
    ].join("\n"),
  };
}
