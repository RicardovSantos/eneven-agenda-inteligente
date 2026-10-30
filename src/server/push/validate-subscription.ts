import { ECDH } from "node:crypto";

export type ValidatedPushSubscription = { endpoint: string; p256dh: string; auth: string };

function decodeCanonical(value: unknown, length: number): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Inscrição de notificações inválida.");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length !== length || bytes.toString("base64url") !== value) throw new Error("Inscrição de notificações inválida.");
  return bytes;
}

/** Valida dados não confiáveis. Não autoriza envio de rede ao endpoint. */
export function validatePushSubscription(input: unknown): ValidatedPushSubscription {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Inscrição de notificações inválida.");
  const data = input as Record<string, unknown>;
  if (typeof data.endpoint !== "string" || data.endpoint.length > 2048 || !data.keys || typeof data.keys !== "object" || Array.isArray(data.keys)) throw new Error("Inscrição de notificações inválida.");
  let url: URL;
  try { url = new URL(data.endpoint); } catch { throw new Error("Inscrição de notificações inválida."); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port || !url.hostname || data.endpoint !== url.href) throw new Error("Inscrição de notificações inválida.");
  const keys = data.keys as Record<string, unknown>;
  const publicKey = decodeCanonical(keys.p256dh, 65);
  decodeCanonical(keys.auth, 16);
  try {
    if (publicKey[0] !== 4) throw new Error();
    ECDH.convertKey(publicKey, "prime256v1", undefined, undefined, "uncompressed");
  } catch { throw new Error("Inscrição de notificações inválida."); }
  return { endpoint: data.endpoint, p256dh: keys.p256dh as string, auth: keys.auth as string };
}
