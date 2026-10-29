import { eq } from "drizzle-orm";
import { memberships, tenants, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { isUniqueViolation } from "@/server/db-errors";
import { getDefaultPlanId } from "@/server/platform/plans";
import { seedTenantDefaults } from "@/server/tenants/defaults";
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
  return createTenantWithOwner(
    db,
    {
      businessName: data.businessName,
      ownerName: data.ownerName,
      email: data.email,
      whatsapp: data.whatsapp,
      passwordHash,
      emailVerifiedAt: null,
    },
    now,
  );
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type NewTenantOwner = {
  businessName: string;
  ownerName: string;
  /** Já validado e em minúsculas. */
  email: string;
  /** Já normalizado (`55` + DDD + número). */
  whatsapp: string;
  /** `null` em contas criadas pelo Google (sem senha). */
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
};

/**
 * Cria o estabelecimento (em teste por 14 dias), o usuário e o vínculo
 * `owner` numa única transação, já com o horário padrão e o dono como
 * primeiro profissional. É a regra única de cadastro, usada pelo
 * cadastro com senha e pelo cadastro com o Google.
 *
 * `inTransaction` roda dentro da mesma transação, depois das linhas criadas
 * (o cadastro com o Google grava o vínculo `oauth_accounts` ali). Lança
 * `AuthError` se o e-mail já tem conta. Uma colisão de slug por corrida é
 * repetida até 3 vezes.
 */
export async function createTenantWithOwner(
  db: Db,
  input: NewTenantOwner,
  now: Date = new Date(),
  inTransaction?: (
    tx: Tx,
    created: { userId: string; tenantId: string },
  ) => Promise<void>,
): Promise<{ userId: string; tenantId: string; slug: string }> {
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const planId = await getDefaultPlanId(db);

  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = await generateUniqueSlug(db, input.businessName);
    try {
      return await db.transaction(async (tx) => {
        const [tenant] = await tx
          .insert(tenants)
          .values({
            slug,
            name: input.businessName,
            status: "trial",
            trialEndsAt,
            planId,
            whatsapp: input.whatsapp,
          })
          .returning({ id: tenants.id });
        const [user] = await tx
          .insert(users)
          .values({
            email: input.email,
            passwordHash: input.passwordHash,
            name: input.ownerName,
            emailVerifiedAt: input.emailVerifiedAt,
          })
          .returning({ id: users.id });
        await tx
          .insert(memberships)
          .values({ userId: user.id, tenantId: tenant.id, role: "owner" });
        await seedTenantDefaults(tx, {
          tenantId: tenant.id,
          ownerUserId: user.id,
          ownerName: input.ownerName,
        });
        const created = { userId: user.id, tenantId: tenant.id };
        await inTransaction?.(tx, created);
        return { ...created, slug };
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
