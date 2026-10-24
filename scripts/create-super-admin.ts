/**
 * Cria um super-admin (dono da plataforma) com e-mail já verificado.
 *
 *   SUPER_ADMIN_PASSWORD='uma-senha-longa' pnpm create-super-admin email@exemplo.com "Nome"
 *
 * A senha vem só da variável de ambiente (nunca por argumento, para não ficar
 * no histórico do terminal). Em produção, defina DATABASE_URL.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { users } from "../src/db/schema";
import { normalizeEmail } from "../src/server/auth/login";
import { hashPassword } from "../src/server/auth/password";
import { signupSchema } from "../src/server/auth/schemas";

const MIN_PASSWORD_LENGTH = 12;

async function main() {
  const [rawEmail, ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(" ").trim();
  const password = process.env.SUPER_ADMIN_PASSWORD ?? "";

  if (!rawEmail || !name) {
    throw new Error(
      'Uso: SUPER_ADMIN_PASSWORD=... pnpm create-super-admin <e-mail> "<nome>"',
    );
  }
  const email = normalizeEmail(rawEmail);
  if (!signupSchema.shape.email.safeParse(email).success) {
    throw new Error(`E-mail inválido: ${rawEmail}`);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Defina SUPER_ADMIN_PASSWORD com pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    );
  }

  const db = await getDb();
  try {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) throw new Error(`Já existe um usuário com o e-mail ${email}.`);

    await db.insert(users).values({
      email,
      name,
      passwordHash: await hashPassword(password),
      isSuperAdmin: true,
      emailVerifiedAt: new Date(),
    });
    console.log(`Super-admin criado: ${name} <${email}>`);
  } finally {
    // Encerra a conexão para o processo poder sair (postgres-js: end; PGlite: close).
    const client = (
      db as unknown as {
        $client: { end?: () => Promise<void>; close?: () => Promise<void> };
      }
    ).$client;
    await (client.end?.() ?? client.close?.());
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
