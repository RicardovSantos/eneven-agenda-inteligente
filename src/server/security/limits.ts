import { createRateLimiter, type RateLimitResult } from "./rate-limit";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Login: 10 tentativas / 15 min por IP + e-mail e 30 / 15 min por IP. */
export const loginByIpAndEmailLimiter = createRateLimiter({ limit: 10, windowMs: 15 * MINUTE_MS });
export const loginByIpLimiter = createRateLimiter({ limit: 30, windowMs: 15 * MINUTE_MS });

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

/** `email` já normalizado (minúsculas, sem espaços). Conta nos dois limites. */
export function limitLogin(ip: string, email: string, now?: number): RateLimitResult {
  return combine([
    loginByIpAndEmailLimiter.hit(`${ip}|${email}`, now),
    loginByIpLimiter.hit(ip, now),
  ]);
}

export function limitSignup(ip: string, now?: number): RateLimitResult {
  return signupLimiter.hit(ip, now);
}

/** `email` já normalizado. Conta nos dois limites. */
export function limitForgotPassword(ip: string, email: string, now?: number): RateLimitResult {
  return combine([
    forgotPasswordByIpLimiter.hit(ip, now),
    forgotPasswordByEmailLimiter.hit(email, now),
  ]);
}

/** Zera todos os limitadores (só para testes). */
export function resetRateLimitsForTests(): void {
  for (const limiter of [
    loginByIpAndEmailLimiter,
    loginByIpLimiter,
    signupLimiter,
    forgotPasswordByIpLimiter,
    forgotPasswordByEmailLimiter,
  ]) {
    limiter.reset();
  }
}
