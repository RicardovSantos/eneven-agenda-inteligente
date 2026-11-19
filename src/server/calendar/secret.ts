import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/** Chave derivada do SESSION_SECRET (mesmo padrão do WhatsApp): sem nova variável de ambiente. */
function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret && (process.env.NODE_ENV === "production" || process.env.APP_URL?.startsWith("https://"))) throw new Error("SESSION_SECRET não definido.");
  return createHmac("sha256", secret || "segredo-de-teste-local").update("google-calendar-token-v1").digest();
}

/** Cifra autenticada (AES-256-GCM) presa ao `context` (ex.: id da conexão): um valor copiado para outra linha não abre. */
export function sealSecret(context: string, value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function openSecret(context: string, sealed: string): string {
  const parts = sealed.split(".");
  if (parts.length !== 3) throw new Error("Segredo cifrado inválido.");
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
