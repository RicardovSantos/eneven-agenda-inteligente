import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pushEvents } from "@/db/schema";
import { enqueueTestPushEvent } from "@/server/push/events";
import { livePushEnabled, pushAvailable, pushVapid } from "@/server/push/mode";
import { withTenantTx } from "@/server/tenant-db";
import { seedBooking, seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

const live = { NODE_ENV: "production", PUSH_ENABLED: "true", PUSH_VAPID_PUBLIC_KEY: "pub", PUSH_VAPID_PRIVATE_KEY: "priv", PUSH_VAPID_SUBJECT: "mailto:eneventech@gmail.com" };

afterEach(() => vi.unstubAllEnvs());

describe("modo do push", () => {
  it("o envio real só liga em produção com o interruptor e as três chaves", () => {
    expect(livePushEnabled(live)).toBe(true);
    expect(livePushEnabled({ ...live, NODE_ENV: "development" })).toBe(false);
    expect(livePushEnabled({ ...live, PUSH_ENABLED: "false" })).toBe(false);
    expect(livePushEnabled({ ...live, PUSH_VAPID_PRIVATE_KEY: "" })).toBe(false);
    expect(livePushEnabled({ ...live, PUSH_VAPID_SUBJECT: "eneventech@gmail.com" })).toBe(false);
  });

  it("fora de produção o push fica sempre disponível; em produção só ligado", () => {
    expect(pushAvailable({ NODE_ENV: "development" })).toBe(true);
    expect(pushAvailable({ NODE_ENV: "production" })).toBe(false);
    expect(pushAvailable(live)).toBe(true);
  });

  it("pushVapid devolve as chaves ou null", () => {
    expect(pushVapid(live)).toEqual({ subject: "mailto:eneventech@gmail.com", publicKey: "pub", privateKey: "priv" });
    expect(pushVapid({ ...live, PUSH_VAPID_PUBLIC_KEY: undefined })).toBeNull();
  });
});

describe("registro dos eventos", () => {
  async function record() {
    const db = await createTestDb();
    const tenant = await seedTenant(db);
    const booking = await seedBooking(db, tenant.id);
    await db.transaction((tx) => withTenantTx(tx, tenant.id, (t) => enqueueTestPushEvent(t, tenant.id, booking.id, "booking_created", "created", new Date())));
    return (await db.select().from(pushEvents).where(eq(pushEvents.tenantId, tenant.id))).length;
  }

  it("em produção só registra com o envio real ligado", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(await record()).toBe(0);
    for (const [key, value] of Object.entries(live)) vi.stubEnv(key, value);
    expect(await record()).toBe(1);
  });

  it("fora de produção registra sempre", async () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(await record()).toBe(1);
  });
});
