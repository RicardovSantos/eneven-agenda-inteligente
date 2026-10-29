import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import type { Db } from "@/db/types";
import { normalizeEmail } from "@/server/auth/login";
import { signupSchema } from "@/server/auth/schemas";

/**
 * Promove um usuário que já existe a super-admin (sem senha: a conta já tem a
 * dela). Usada por `scripts/create-super-admin.ts --promote`.
 */
export async function promoteSuperAdmin(
  db: Db,
  rawEmail: string,
): Promise<{ email: string; alreadySuperAdmin: boolean }> {
  const email = normalizeEmail(rawEmail);
  if (!signupSchema.shape.email.safeParse(email).success) {
    throw new Error(`E-mail inválido: ${rawEmail}`);
  }
  const [user] = await db
    .select({ id: users.id, isSuperAdmin: users.isSuperAdmin })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) {
    throw new Error(
      `Não existe usuário com o e-mail ${email}. Crie a conta antes (cadastro ou create-super-admin).`,
    );
  }
  if (!user.isSuperAdmin) {
    await db.update(users).set({ isSuperAdmin: true }).where(eq(users.id, user.id));
  }
  return { email, alreadySuperAdmin: user.isSuperAdmin };
}
