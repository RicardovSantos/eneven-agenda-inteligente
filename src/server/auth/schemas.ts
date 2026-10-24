import { z } from "zod";
import { normalizeBrazilPhone } from "@/lib/phone";

export const EMAIL_TAKEN_MESSAGE =
  "Este e-mail já tem uma conta. Entre ou recupere a senha.";
export const LOGIN_FAILED_MESSAGE = "E-mail ou senha incorretos.";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Informe um e-mail válido.").max(254, "Informe um e-mail válido."));

export const signupSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1, "Informe o nome do estabelecimento.")
    .max(120, "O nome do estabelecimento pode ter no máximo 120 caracteres."),
  ownerName: z
    .string()
    .trim()
    .min(1, "Informe seu nome.")
    .max(120, "Seu nome pode ter no máximo 120 caracteres."),
  whatsapp: z.string().transform((value, ctx) => {
    const normalized = normalizeBrazilPhone(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Informe um WhatsApp com DDD." });
      return z.NEVER;
    }
    return normalized;
  }),
  email,
  password: z
    .string()
    .min(8, "A senha precisa ter pelo menos 8 caracteres.")
    .max(128, "A senha pode ter no máximo 128 caracteres."),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Informe sua senha.").max(128, LOGIN_FAILED_MESSAGE),
});

export type SignupInput = z.input<typeof signupSchema>;

/** Primeira mensagem de cada campo. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in result)) result[key] = issue.message;
  }
  return result;
}
