import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret && (process.env.NODE_ENV === "production" || process.env.APP_URL?.startsWith("https://"))) throw new Error("SESSION_SECRET não definido.");
  return createHmac("sha256", secret || "segredo-de-teste-local").update("whatsapp-inbound-v1").digest();
}

/** Cifra autenticada vinculada ao ID do evento; não persiste tokens em texto. */
export function encryptInboundEvent(id: string, value: object): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(id));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptInboundEvent<T>(id: string, value: string): T {
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("Evento cifrado inválido.");
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAAD(Buffer.from(id));
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")) as T;
}
