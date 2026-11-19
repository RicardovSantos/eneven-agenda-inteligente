const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";

type Fetcher = typeof fetch;

/** Erro de uma chamada ao Google. `reason` vem do corpo (`invalid_grant`, `rateLimitExceeded`...). */
export class GoogleApiError extends Error {
  constructor(readonly status: number, readonly reason: string) {
    super(`Google ${status} ${reason}`);
    this.name = "GoogleApiError";
  }
  /** O Google recusou o token de renovação: acesso retirado, vencido ou conta apagada. Só reconectando. */
  get needsReconnect(): boolean {
    return this.reason === "invalid_grant" || this.status === 401;
  }
  /** A agenda do app foi apagada pela pessoa no Google: o app cria outra e reenvia tudo. */
  get calendarGone(): boolean {
    return this.status === 404 && this.reason === "notFound";
  }
  /** Limite de uso ou falha do lado do Google: tenta de novo mais tarde, sem culpar a conexão. */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500 || (this.status === 403 && /rate|quota/i.test(this.reason));
  }
}

async function failure(response: Response): Promise<GoogleApiError> {
  let reason = "unknown";
  try {
    const body = (await response.json()) as { error?: unknown; error_description?: unknown };
    if (typeof body.error === "string") reason = body.error;
    else if (body.error && typeof body.error === "object") {
      const detail = body.error as { errors?: { reason?: unknown }[]; status?: unknown };
      const first = detail.errors?.[0]?.reason;
      reason = typeof first === "string" ? first : typeof detail.status === "string" ? detail.status : reason;
    }
  } catch {
    // Corpo vazio ou não-JSON: fica só o status.
  }
  return new GoogleApiError(response.status, reason);
}

const timeout = () => AbortSignal.timeout(15_000);

/** Troca o token de renovação por um token de acesso curto (cerca de 1 hora). */
export async function refreshAccessToken(refreshToken: string, creds: { clientId: string; clientSecret: string }, fetcher: Fetcher = fetch): Promise<{ accessToken: string; expiresAt: number }> {
  const response = await fetcher(TOKEN_URL, {
    method: "POST", signal: timeout(), headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: creds.clientId, client_secret: creds.clientSecret }),
  });
  if (!response.ok) throw await failure(response);
  const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string") throw new GoogleApiError(502, "bad_token_response");
  const seconds = typeof body.expires_in === "number" ? body.expires_in : 3000;
  return { accessToken: body.access_token, expiresAt: Date.now() + (seconds - 60) * 1000 };
}

/** Retira o acesso no Google (best-effort: quem chama ignora a falha). */
export async function revokeToken(token: string, fetcher: Fetcher = fetch): Promise<void> {
  const response = await fetcher(REVOKE_URL, { method: "POST", signal: timeout(), headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) });
  if (!response.ok && response.status !== 400) throw await failure(response);
}

async function call(fetcher: Fetcher, accessToken: string, method: string, path: string, body?: unknown): Promise<Response> {
  return fetcher(`${API}${path}`, {
    method, signal: timeout(),
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Cria a agenda secundária do app e devolve o id dela. */
export async function createCalendar(accessToken: string, input: { summary: string; timeZone: string }, fetcher: Fetcher = fetch): Promise<string> {
  const response = await call(fetcher, accessToken, "POST", "/calendars", input);
  if (!response.ok) throw await failure(response);
  const body = (await response.json()) as { id?: unknown };
  if (typeof body.id !== "string" || !body.id) throw new GoogleApiError(502, "bad_calendar_response");
  return body.id;
}

export type GoogleEvent = {
  id: string;
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  colorId?: string;
  reminders: { useDefault: boolean };
  status: "confirmed";
  extendedProperties: { private: Record<string, string> };
};

/**
 * Cria o evento com o id que escolhemos (único por agendamento): repetir o envio não duplica. Se já existe
 * (409, ex.: resposta perdida na rede ou evento apagado que o Google ainda guarda), atualiza.
 */
export async function upsertEvent(accessToken: string, calendarId: string, event: GoogleEvent, fetcher: Fetcher = fetch): Promise<void> {
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
  const created = await call(fetcher, accessToken, "POST", base, event);
  if (created.ok) return;
  if (created.status !== 409) throw await failure(created);
  const updated = await call(fetcher, accessToken, "PUT", `${base}/${encodeURIComponent(event.id)}`, event);
  if (!updated.ok) throw await failure(updated);
}

/** Apaga o evento; já apagado (404/410) conta como feito. */
export async function deleteEvent(accessToken: string, calendarId: string, eventId: string, fetcher: Fetcher = fetch): Promise<void> {
  const response = await call(fetcher, accessToken, "DELETE", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
  if (!response.ok && response.status !== 404 && response.status !== 410) throw await failure(response);
}
