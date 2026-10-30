import { billingWebhookEvents } from "@/db/schema";
import type { Db } from "@/db/types";
import { verifyMercadoPagoSignature } from "./webhook-signature";

const topics = new Set(["payment", "subscription_preapproval", "subscription_authorized_payment"]);

/** Persiste só o sinal; a situação do pagamento deve ser consultada no provedor. */
export async function recordBillingWebhook(db: Db, input: {
  signature: string | null; requestId: string | null; dataId: string | null;
  secret: string | undefined; topic: unknown; now?: Date;
}): Promise<"accepted" | "invalid" | "unsupported"> {
  if (!verifyMercadoPagoSignature(input)) return "invalid";
  if (typeof input.topic !== "string" || !topics.has(input.topic)) return "unsupported";
  if (input.requestId!.length > 200 || input.dataId!.length > 200) return "invalid";
  await db.insert(billingWebhookEvents).values({ requestId: input.requestId!, resourceId: input.dataId!, topic: input.topic, receivedAt: input.now ?? new Date() }).onConflictDoNothing();
  return "accepted";
}
