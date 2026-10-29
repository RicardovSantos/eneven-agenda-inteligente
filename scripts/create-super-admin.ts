/**
 * Cria um super-admin (dono da plataforma) com e-mail já verificado.
 *
 *   SUPER_ADMIN_PASSWORD='uma-senha-longa' pnpm create-super-admin email@exemplo.com "Nome"
 *
 * Ou promove uma conta que já existe (sem senha, a conta mantém a dela):
 *
 *   pnpm create-super-admin --promote email@exemplo.com
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
import { promoteSuperAdmin } from "../src/server/platform/super-admin";

const MIN_PASSWORD_LENGTH = 12;

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--promote") {
    const email = args[1];
    if (!email || args.length > 2) {
      throw new Error("Uso: pnpm create-super-admin --promote <e-mail>");
    }
    await withDb(async (db) => {
      const result = await promoteSuperAdmin(db, email);
      console.log(
        result.alreadySuperAdmin
          ? `${result.email} já é super-admin.`
          : `Super-admin promovido: ${result.email}`,
      );
    });
    return;
  }

  const [rawEmail, ...nameParts] = args;
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

  await withDb(async (db) => {
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
  });
}

type ScriptDb = Awaited<ReturnType<typeof getDb>>;

async function withDb(run: (db: ScriptDb) => Promise<void>) {
  const db = await getDb();
  try {
    await run(db);
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
