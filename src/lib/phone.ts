/**
 * Telefones brasileiros. Funções puras, usadas no cliente (máscara) e no
 * servidor (normalização). Sem imports de servidor.
 */

const onlyDigits = (value: string) => value.replace(/\D/g, "");

/**
 * Normaliza um WhatsApp brasileiro para apenas dígitos com o código do país
 * (`55` + DDD + número). Aceita 10 ou 11 dígitos nacionais, com ou sem
 * máscara, com ou sem `+55`. Retorna `null` quando inválido.
 *
 *   "(11) 99999-9999" -> "5511999999999"
 */
export function normalizeBrazilPhone(input: string): string | null {
  let digits = onlyDigits(input);
  // 55 + 10/11 dígitos = código do país presente. Um número nacional de 11
  // dígitos com DDD 55 (RS) tem 11 dígitos, então não colide.
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10 && digits.length !== 11) return null;
  // DDD de 11 a 99.
  if (!/^[1-9][1-9]/.test(digits)) return null;
  // Celular (11 dígitos) começa com 9; fixo (10 dígitos) começa com 2 a 9.
  const first = digits[2];
  if (digits.length === 11 && first !== "9") return null;
  if (digits.length === 10 && first === "0") return null;
  if (digits.length === 10 && first === "1") return null;
  return `55${digits}`;
}

/** Máscara de digitação: `(11) 99999-9999` (ou `(11) 9999-9999` com 10 dígitos). */
export function formatBrazilPhone(value: string): string {
  let digits = onlyDigits(value);
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  digits = digits.slice(0, 11);

  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (digits.length <= 6) return `(${ddd}) ${rest}`;
  const split = digits.length === 11 ? 5 : 4;
  return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}
