type Env = Record<string, string | undefined>;

/**
 * Escopo mais estreito possível: o app cria uma agenda própria ("Eneven Agenda") e só mexe nela. Nunca lê
 * nem altera os outros eventos da pessoa. Se o Google classificar este escopo como sensível, a verificação
 * do app é necessária antes de abrir para todos (veja docs/google-agenda.md).
 */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
export const CALENDAR_NAME = "Eneven Agenda";

/**
 * A integração só liga com o interruptor `GOOGLE_CALENDAR_ENABLED=true` (desligado por padrão, até a
 * verificação do Google terminar) e as credenciais do Google já usadas no login. Desligada, o card em
 * Configurações aparece travado e nada é sincronizado.
 */
export function googleCalendarEnabled(env: Env = process.env): boolean {
  return env.GOOGLE_CALENDAR_ENABLED === "true" && Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}
