import { z } from "zod";
import { isHexColor } from "@/lib/color";
import { normalizeBrazilPhone } from "@/lib/phone";

export const ABOUT_MAX = 160;

/** Valores aceitos pela tela (docs/design/telas/plano-2.md § Configurações). */
export const SLOT_INTERVAL_OPTIONS = [10, 15, 20, 30] as const;
export const MIN_NOTICE_OPTIONS = [30, 60, 120, 240, 1440] as const;
export const MAX_DAYS_AHEAD_OPTIONS = [15, 30, 60, 90] as const;
export const CANCEL_WINDOW_OPTIONS = [60, 120, 720, 1440] as const;

const oneOf = <T extends readonly number[]>(values: T, message: string) =>
  z
    .number(message)
    .refine((n) => values.includes(n), message) as unknown as z.ZodType<T[number]>;

const optionalText = (max: number, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .transform((v) => (v === "" ? null : v));

/** Aceita `@usuario`, `usuario` ou o link do perfil; devolve só o usuário. */
const instagram = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;
    const handle = value
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
      .replace(/[/?#].*$/, "")
      .replace(/^@/, "");
    if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) {
      ctx.addIssue({ code: "custom", message: "Informe um usuário do Instagram válido." });
      return z.NEVER;
    }
    return handle;
  });

export const businessInfoSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome do estabelecimento.")
    .max(120, "O nome pode ter no máximo 120 caracteres."),
  whatsapp: z.string().transform((value, ctx) => {
    const normalized = normalizeBrazilPhone(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Informe um WhatsApp com DDD." });
      return z.NEVER;
    }
    return normalized;
  }),
  address: optionalText(160, "O endereço pode ter no máximo 160 caracteres."),
  instagram,
  about: optionalText(ABOUT_MAX, `O texto pode ter no máximo ${ABOUT_MAX} caracteres.`),
});
export type BusinessInfoInput = z.input<typeof businessInfoSchema>;

export const brandingSchema = z.object({
  color: z
    .string()
    .trim()
    .refine(isHexColor, "Informe uma cor no formato #RRGGBB."),
});

export const bookingRulesSchema = z.object({
  slotIntervalMin: oneOf(SLOT_INTERVAL_OPTIONS, "Escolha um intervalo da lista."),
  minNoticeMin: oneOf(MIN_NOTICE_OPTIONS, "Escolha uma antecedência da lista."),
  maxDaysAhead: oneOf(MAX_DAYS_AHEAD_OPTIONS, "Escolha um prazo da lista."),
  cancelWindowMin: oneOf(CANCEL_WINDOW_OPTIONS, "Escolha um prazo da lista."),
});
export type BookingRulesInput = z.input<typeof bookingRulesSchema>;

/** Primeira mensagem de cada campo. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in result)) result[key] = issue.message;
  }
  return result;
}
