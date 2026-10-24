import { eq } from "drizzle-orm";
import { memberships, tenants, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { isUniqueViolation } from "@/server/db-errors";
import { generateUniqueSlug } from "@/server/tenants/slug";
import { AuthError } from "./errors";
import { hashPassword } from "./password";
import {
  EMAIL_TAKEN_MESSAGE,
  signupSchema,
  toFieldErrors,
  type SignupInput,
} from "./schemas";

export const TRIAL_DAYS = 14;
const MAX_SLUG_ATTEMPTS = 3;

const emailTaken = () =>
  new AuthError(EMAIL_TAKEN_MESSAGE, "email_taken", {
    email: EMAIL_TAKEN_MESSAGE,
  });

/**
 * Cadastro: cria o estabelecimento (em teste por 14 dias), o usuário e o
 * vínculo `owner` numa única transação.
 *
 * Lança `AuthError` com mensagem em português para entrada inválida e e-mail
 * já cadastrado. Uma colisão de slug por corrida é repetida até 3 vezes.
 */
export async function signup(
  db: Db,
  input: SignupInput,
  now: Date = new Date(),
): Promise<{ userId: string; tenantId: string; slug: string }> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = toFieldErrors(parsed.error);
    throw new AuthError(
      Object.values(fieldErrors)[0] ?? "Dados inválidos.",
      "validation",
      fieldErrors,
    );
  }
  const data = parsed.data;

  // Caminho comum sem depender da constraint.
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, data.email))
    .limit(1);
  if (existing) throw emailTaken();

  const passwordHash = await hashPassword(data.password);
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = await generateUniqueSlug(db, data.businessName);
    try {
      return await db.transaction(async (tx) => {
        const [tenant] = await tx
          .insert(tenants)
          .values({
            slug,
            name: data.businessName,
            status: "trial",
            trialEndsAt,
            whatsapp: data.whatsapp,
          })
          .returning({ id: tenants.id });
        const [user] = await tx
          .insert(users)
          .values({ email: data.email, passwordHash, name: data.ownerName })
          .returning({ id: users.id });
        await tx
          .insert(memberships)
          .values({ userId: user.id, tenantId: tenant.id, role: "owner" });
        return { userId: user.id, tenantId: tenant.id, slug };
      });
    } catch (error) {
      if (isUniqueViolation(error, "users_email_unique")) throw emailTaken();
      if (isUniqueViolation(error, "tenants_slug_unique")) {
        if (attempt < MAX_SLUG_ATTEMPTS) continue;
        throw new AuthError(
          "Não foi possível reservar o endereço da sua agenda agora. Tente novamente.",
          "unavailable",
        );
      }
      throw error;
    }
  }
  // Inalcançável: o laço sempre retorna ou lança.
  throw new AuthError("Não foi possível criar sua conta agora.", "unavailable");
}
