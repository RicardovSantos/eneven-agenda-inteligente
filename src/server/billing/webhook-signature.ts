import { createHmac, timingSafeEqual } from "node:crypto";

/** Valida os identificadores assinados; não autentica os demais campos do corpo. */
export function verifyMercadoPagoSignature(input: {
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string | undefined;
  now?: Date;
  toleranceSeconds?: number;
}): boolean {
  const { signature, requestId, dataId, secret } = input;
  if (!signature || !requestId || !dataId || !secret) return false;
  // Valores ambíguos ou contendo separadores não devem compor o manifesto.
  if (/[;\r\n]/.test(requestId) || /[;\r\n]/.test(dataId)) return false;
  const fields = signature.split(",").map((part) => part.trim().split("="));
  const timestamps = fields.filter(([key]) => key === "ts");
  const digests = fields.filter(([key]) => key === "v1");
  if (timestamps.length !== 1 || digests.length !== 1 || timestamps[0].length !== 2 || digests[0].length !== 2) return false;
  const ts = timestamps[0][1];
  const digest = digests[0][1];
  if (!/^\d{10}$/.test(ts) || !/^[a-f0-9]{64}$/i.test(digest)) return false;
  const now = input.now ?? new Date();
  const tolerance = input.toleranceSeconds ?? 300;
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(tolerance) || tolerance < 0 || Math.abs(now.getTime() / 1000 - Number(ts)) > tolerance) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest();
  return timingSafeEqual(expected, Buffer.from(digest, "hex"));
}
