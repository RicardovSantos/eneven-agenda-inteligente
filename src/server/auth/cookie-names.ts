/**
 * Nomes dos cookies da autenticação, num lugar só.
 *
 * Em produção os cookies do fluxo OAuth e o do perfil pendente usam o prefixo
 * `__Host-`: o navegador só os aceita com `Secure`, `Path=/` e sem `Domain`, o
 * que impede um subdomínio de plantar um cookie igual. Em desenvolvimento e
 * nos testes (http, sem HTTPS) ficam os nomes simples.
 */
export function cookieName(base: string, nodeEnv: string | undefined = process.env.NODE_ENV): string {
  return nodeEnv === "production" ? `__Host-${base}` : base;
}

/** Sessão do painel (o token vai em texto no cookie; o banco guarda só o hash). */
export const SESSION_COOKIE = "ea_session";

/** Fluxo "Entrar com o Google" (vivem 10 min) e perfil pendente (15 min). */
export const OAUTH_STATE_COOKIE = cookieName("ea_oauth_state");
export const OAUTH_VERIFIER_COOKIE = cookieName("ea_oauth_verifier");
export const OAUTH_INTENT_COOKIE = cookieName("ea_oauth_intent");
export const GOOGLE_PENDING_COOKIE = cookieName("ea_google_pending");

/**
 * Rótulo que entra no HMAC do perfil pendente. Fixo (não muda com o prefixo
 * `__Host-`) e diferente de qualquer outro valor assinado.
 */
export const GOOGLE_PENDING_PURPOSE = "ea_google_pending";
