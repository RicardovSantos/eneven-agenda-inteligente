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

/**
 * Página pública de agendamento: reservar = 10 / 10 min por IP e 5 / h por
 * telefone (barra quem enche a agenda de um salão); consultar horários = 120 /
 * min por IP (cada consulta lê o banco); remarcar/cancelar pelo link = 20 / 10
 * min por IP.
 */
export const bookingByIpLimiter = createRateLimiter({ limit: 10, windowMs: 10 * MINUTE_MS });
export const bookingByPhoneLimiter = createRateLimiter({ limit: 5, windowMs: HOUR_MS });
export const publicReadByIpLimiter = createRateLimiter({ limit: 120, windowMs: MINUTE_MS });
export const manageByIpLimiter = createRateLimiter({ limit: 20, windowMs: 10 * MINUTE_MS });

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

/** Só o IP (a reserva confere o telefone depois de validar entrada e estabelecimento). */
export function limitBookingIp(ip: string, now?: number): RateLimitResult {
  return bookingByIpLimiter.hit(ip, now);
}

/** Só o telefone normalizado. */
export function limitBookingPhone(phone: string, now?: number): RateLimitResult {
  return bookingByPhoneLimiter.hit(phone, now);
}

export function limitPublicRead(ip: string, now?: number): RateLimitResult {
  return publicReadByIpLimiter.hit(ip, now);
}

export function limitManage(ip: string, now?: number): RateLimitResult {
  return manageByIpLimiter.hit(ip, now);
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
    bookingByIpLimiter,
    bookingByPhoneLimiter,
    publicReadByIpLimiter,
    manageByIpLimiter,
  ]) {
    limiter.reset();
  }
}
