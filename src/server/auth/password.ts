import { hash, verify } from "@node-rs/argon2";

// Argon2id é o algoritmo padrão do @node-rs/argon2; custos seguem a
// recomendação da OWASP (19 MiB, 2 iterações, 1 thread).
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // Hash malformado: trata como senha incorreta.
    return false;
  }
}
