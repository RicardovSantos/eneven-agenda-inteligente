import { createHmac } from "node:crypto";
import { expect, it } from "vitest";
import { billingWebhookEvents } from "@/db/schema";
import { recordBillingWebhook } from "@/server/billing/webhook";
import { createTestDb } from "../helpers/test-db";

it("persiste uma única vez o sinal autenticado e não grava dados inválidos", async () => {
  const db = await createTestDb();
  const now = new Date("2030-01-01T00:00:00Z");
  const ts = String(Math.floor(now.getTime() / 1000));
  const digest = createHmac("sha256", "secret").update(`id:payment-1;request-id:req-1;ts:${ts};`).digest("hex");
  const input = { signature: `ts=${ts},v1=${digest}`, requestId: "req-1", dataId: "payment-1", secret: "secret", topic: "payment", now };
  expect(await recordBillingWebhook(db, input)).toBe("accepted");
  expect(await recordBillingWebhook(db, input)).toBe("accepted");
  expect(await recordBillingWebhook(db, { ...input, dataId: "payment-2" })).toBe("invalid");
  expect(await recordBillingWebhook(db, { ...input, topic: "outro" })).toBe("unsupported");
  expect(await db.select().from(billingWebhookEvents)).toHaveLength(1);
});
