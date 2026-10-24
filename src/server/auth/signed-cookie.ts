import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Valores assinados para cookies curtos (ex.: o perfil do Google pendente).
 * Formato: `base64url(JSON {exp, data}).base64url(HMAC-SHA256)`. O HMAC cobre
 * `propósito|corpo`, então um valor assinado para um cookie não vale em outro.
 * O conteúdo é legível por quem tem o cookie, mas não pode ser alterado nem
 * reaproveitado depois de vencer.
 */

// Só para desenvolvimento e testes, quando SESSION_SECRET não está definido.
const DEV_SECRET = "eneven-agenda-segredo-somente-para-desenvolvimento";
let warnedAboutDevSecret = false;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (value) return value;
  // O segredo fixo é público (está no repositório): nunca vale num ambiente
  // acessível pela internet, o que inclui qualquer APP_URL em https.
  if (process.env.NODE_ENV === "production" || process.env.APP_URL?.startsWith("https://")) {
    throw new Error("SESSION_SECRET não definido. Configure o segredo das sessões.");
  }
  if (!warnedAboutDevSecret && process.env.NODE_ENV !== "test") {
    warnedAboutDevSecret = true;
    console.warn(
      "SESSION_SECRET não definido: usando um segredo fixo de desenvolvimento. Defina SESSION_SECRET no .env.",
    );
  }
  return DEV_SECRET;
}

const sign = (body: string, purpose: string) =>
  createHmac("sha256", secret()).update(`${purpose}|${body}`).digest("base64url");

/** Comparação em tempo constante de duas strings (tamanhos diferentes: falso). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Assina `payload` para o `purpose` indicado (rótulo do cookie, ex.:
 * `"ea_google_pending"`); o valor vence em `maxAgeSeconds` (negativo: já vencido).
 */
export function signValue(payload: object, maxAgeSeconds: number, purpose: string): string {
  const body = Buffer.from(
    JSON.stringify({ exp: Date.now() + maxAgeSeconds * 1000, data: payload }),
  ).toString("base64url");
  return `${body}.${sign(body, purpose)}`;
}

/** Devolve o conteúdo, ou `null` se for inválido, adulterado, vencido ou de outro `purpose`. */
export function verifyValue<T = unknown>(value: string, purpose: string): T | null {
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!safeEqual(signature, sign(body, purpose))) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as { exp?: unknown }).exp !== "number" ||
      (parsed as { exp: number }).exp <= Date.now() ||
      !("data" in parsed)
    ) {
      return null;
    }
    return (parsed as { data: T }).data;
  } catch {
    return null;
  }
}
