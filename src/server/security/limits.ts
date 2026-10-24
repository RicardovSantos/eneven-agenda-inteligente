import { createRateLimiter, type RateLimitResult } from "./rate-limit";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Login: 10 tentativas / 15 min por IP + e-mail, 30 / 15 min por IP e 100 / 24 h
 * por e-mail (teto da conta, de qualquer IP: barra ataque distribuído).
 */
export const loginByIpAndEmailLimiter = createRateLimiter({ limit: 10, windowMs: 15 * MINUTE_MS });
export const loginByIpLimiter = createRateLimiter({ limit: 30, windowMs: 15 * MINUTE_MS });
export const loginByEmailLimiter = createRateLimiter({ limit: 100, windowMs: 24 * HOUR_MS });

/** Cadastro (senha e "completar" do Google): 5 / h por IP, no mesmo limite. */
export const signupLimiter = createRateLimiter({ limit: 5, windowMs: HOUR_MS });

/** Recuperar senha: 5 / h por IP e 5 / h por e-mail. */
export const forgotPasswordByIpLimiter = createRateLimiter({ limit: 5, windowMs: HOUR_MS });
export const forgotPasswordByEmailLimiter = createRateLimiter({ limit: 5, windowMs: HOUR_MS });

/** Junta os resultados: recusa se qualquer um recusar, com o maior tempo de espera. */
function combine(results: RateLimitResult[]): RateLimitResult {
  const blocked = results.filter(
    (r): r is Extract<RateLimitResult, { ok: false }> => !r.ok,
  );
  if (blocked.length === 0) return { ok: true };
  return { ok: false, retryAfterSec: Math.max(...blocked.map((r) => r.retryAfterSec)) };
}

/**
 * `email` já normalizado (minúsculas, sem espaços). Confere em ordem, parando
 * no primeiro que recusar: IP, IP + e-mail e por último o teto da conta. Assim
 * IP bloqueado não gasta nem cria chave por IP + e-mail (quem varre e-mails
 * inventados não enche a memória) e tentativas já recusadas não consomem o
 * teto de 100 / 24 h do e-mail.
 */
export function limitLogin(ip: string, email: string, now?: number): RateLimitResult {
  const byIp = loginByIpLimiter.hit(ip, now);
  if (!byIp.ok) return byIp;
  const byIpAndEmail = loginByIpAndEmailLimiter.hit(`${ip}|${email}`, now);
  if (!byIpAndEmail.ok) return byIpAndEmail;
  return loginByEmailLimiter.hit(email, now);
}

export function limitSignup(ip: string, now?: number): RateLimitResult {
  return signupLimiter.hit(ip, now);
}

/** `email` já normalizado. IP primeiro; IP bloqueado não cria chave por e-mail. */
export function limitForgotPassword(ip: string, email: string, now?: number): RateLimitResult {
  const byIp = forgotPasswordByIpLimiter.hit(ip, now);
  if (!byIp.ok) return byIp;
  return combine([byIp, forgotPasswordByEmailLimiter.hit(email, now)]);
}

/** Zera todos os limitadores (só para testes). */
export function resetRateLimitsForTests(): void {
  for (const limiter of [
    loginByEmailLimiter,
    loginByIpAndEmailLimiter,
    loginByIpLimiter,
    signupLimiter,
    forgotPasswordByIpLimiter,
    forgotPasswordByEmailLimiter,
  ]) {
    limiter.reset();
  }
}
