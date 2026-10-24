import { eq } from "drizzle-orm";
import { memberships, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { hashPassword, verifyPassword } from "./password";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Hash descartável para gastar o mesmo tempo quando o e-mail não existe
// (evita descobrir contas pelo tempo de resposta).
let dummyHash: Promise<string> | undefined;

/**
 * Confere e-mail e senha. Retorna `{ userId }` ou `null` (sem dizer qual dos
 * dois está errado).
 */
export async function login(
  db: Db,
  email: string,
  password: string,
): Promise<{ userId: string } | null> {
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);

  if (!user) {
    dummyHash ??= hashPassword("senha-descartavel-para-equalizar-tempo");
    await verifyPassword(await dummyHash, password);
    return null;
  }

  return (await verifyPassword(user.passwordHash, password))
    ? { userId: user.id }
    : null;
}

/**
 * Tenant da sessão recém-criada: o único vínculo do usuário. Sem vínculo
 * (super-admin) ou com vários, retorna `null` (a escolha de
 * estabelecimento fica para um plano futuro).
 */
export async function resolveLoginTenantId(
  db: Db,
  userId: string,
): Promise<string | null> {
  const rows = await db
    .select({ tenantId: memberships.tenantId })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .limit(2);
  return rows.length === 1 ? rows[0].tenantId : null;
}
