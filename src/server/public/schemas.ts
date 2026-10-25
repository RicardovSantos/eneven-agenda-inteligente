import { z } from "zod";
import { normalizeBrazilPhone } from "@/lib/phone";

/** Mensagens da página pública (pt-BR, dizem o que houve e como resolver). */
export const MESSAGES = {
  consent: "Marque a caixa para concordar com o uso dos seus dados.",
  name: "Informe seu nome (de 2 a 80 caracteres).",
  phone: "Informe um WhatsApp com DDD.",
  email: "Informe um e-mail válido ou deixe em branco.",
  unavailable: "Agendamento online indisponível no momento.",
  generic: "Não foi possível agendar agora. Tente novamente em instantes.",
} as const;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const selection = {
  serviceIds: z.array(z.uuid()).min(1).max(20),
  professionalId: z.union([z.literal("any"), z.uuid()]),
};

export const slotsInputSchema = z.object({ ...selection, date });
export const datesInputSchema = z.object({ ...selection, from: date });
export type SlotsInput = z.infer<typeof slotsInputSchema>;
export type DatesInput = z.infer<typeof datesInputSchema>;

export const bookInputSchema = z.object({
  ...selection,
  startsAt: z.iso.datetime({ offset: true }),
  name: z.string().trim().min(2, MESSAGES.name).max(80, MESSAGES.name),
  phone: z.string().transform((value, ctx) => {
    const normalized = normalizeBrazilPhone(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: MESSAGES.phone });
      return z.NEVER;
    }
    return normalized;
  }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(160, MESSAGES.email)
    .refine((v) => v === "" || z.email().safeParse(v).success, MESSAGES.email)
    .optional(),
  consent: z.literal(true, { error: MESSAGES.consent }),
});
export type BookInput = z.input<typeof bookInputSchema>;

export const rescheduleInputSchema = z.object({ startsAt: z.iso.datetime({ offset: true }) });

/** Primeira mensagem de cada campo. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in result)) result[key] = issue.message;
  }
  return result;
}
