import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { billingSubscriptions, memberships, tenants, trialNotices, users } from "@/db/schema";
import { sendTrialNotice } from "@/server/billing/owner-notice";
import { processTrialNotices, type TrialNoticeKind } from "@/server/billing/trial-notices";
import { seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

const sent = vi.hoisted(() => ({ mail: vi.fn(async (...args: unknown[]) => { void args; }) }));
vi.mock("@/server/email/send", () => ({ sendEmail: sent.mail }));

const NOW = new Date("2030-03-10T12:00:00Z");
const DAY = 86_400_000;

beforeEach(() => sent.mail.mockClear());

async function trialTenant(db: Awaited<ReturnType<typeof createTestDb>>, endsInDays: number, extra: Partial<typeof tenants.$inferInsert> = {}) {
  const tenant = await seedTenant(db);
  await db.update(tenants).set({ status: "trial", trialEndsAt: new Date(NOW.getTime() + endsInDays * DAY), ...extra }).where(eq(tenants.id, tenant.id));
  return tenant;
}

describe("avisos de fim do teste", () => {
  it("avisa quando faltam até 3 dias e depois que terminou, uma vez de cada, e ignora o resto", async () => {
    const db = await createTestDb();
    const ending = await trialTenant(db, 2);
    const far = await trialTenant(db, 6);
    const ended = await trialTenant(db, -1);
    const old = await trialTenant(db, -10);
    const active = await trialTenant(db, 2, { status: "active" });
    const send = vi.fn(async (...args: [string, TrialNoticeKind, Date]) => { void args; });
    expect(await processTrialNotices(db, send, { now: NOW })).toEqual({ sent: 2, uncertain: 0 });
    const calls = send.mock.calls.map(([id, kind]) => `${id}:${kind}`).sort();
    expect(calls).toEqual([`${ending.id}:ending`, `${ended.id}:ended`].sort());
    for (const other of [far, old, active]) expect(calls.some((c) => c.startsWith(other.id))).toBe(false);
    // Nada se repete, e quando o prazo chega o "terminou" sai uma vez.
    expect(await processTrialNotices(db, send, { now: NOW })).toEqual({ sent: 0, uncertain: 0 });
    const later = new Date(NOW.getTime() + 3 * DAY);
    // Três dias depois: o primeiro teste acabou ("terminou") e o que faltava 6 dias entrou na janela ("termina em breve").
    expect(await processTrialNotices(db, send, { now: later })).toEqual({ sent: 2, uncertain: 0 });
    expect(send).toHaveBeenCalledWith(ending.id, "ended", expect.any(Date));
    expect(send).toHaveBeenCalledWith(far.id, "ending", expect.any(Date));
    expect((await db.select().from(trialNotices)).filter((n) => n.state === "sent")).toHaveLength(4);
  });

  it("não avisa quem já começou a assinar e registra a falha incerta sem repetir", async () => {
    const db = await createTestDb();
    const paying = await trialTenant(db, 1);
    await db.insert(billingSubscriptions).values({ tenantId: paying.id, planId: paying.planId, priceCents: 3990, providerId: "s", providerStatus: "pending" });
    const failing = await trialTenant(db, 1);
    const send = vi.fn(async (id: string, ...rest: [TrialNoticeKind, Date]) => { void rest; if (id === failing.id) throw new Error("timeout"); });
    expect(await processTrialNotices(db, send, { now: NOW })).toEqual({ sent: 0, uncertain: 1 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(await processTrialNotices(db, send, { now: NOW })).toEqual({ sent: 0, uncertain: 0 });
    expect((await db.select().from(trialNotices))[0]).toMatchObject({ tenantId: failing.id, state: "uncertain" });
  });
});

describe("e-mail do fim do teste", () => {
  async function withOwner(db: Awaited<ReturnType<typeof createTestDb>>, verified = true) {
    const tenant = await trialTenant(db, 2);
    const [owner] = await db.insert(users).values({ name: "Dona", email: "dona@example.com", emailVerifiedAt: verified ? new Date() : null }).returning();
    await db.insert(memberships).values({ tenantId: tenant.id, userId: owner.id, role: "owner" });
    return tenant;
  }

  it("manda para o dono com e-mail confirmado, com a data e o link para assinar", async () => {
    vi.stubEnv("APP_URL", "https://agenda.exemplo.com");
    const db = await createTestDb();
    const tenant = await withOwner(db);
    await sendTrialNotice(db, tenant.id, "ending", new Date("2030-03-12T15:00:00Z"));
    expect(sent.mail).toHaveBeenCalledTimes(1);
    const message = sent.mail.mock.calls[0][0] as { to: string; subject: string; text: string };
    expect(message.to).toBe("dona@example.com");
    expect(message.subject).toContain("12 de março de 2030");
    expect(message.text).toContain("https://agenda.exemplo.com/painel/configuracoes/assinatura");
    sent.mail.mockClear();
    await sendTrialNotice(db, tenant.id, "ended", new Date("2030-03-12T15:00:00Z"));
    expect((sent.mail.mock.calls[0][0] as { subject: string }).subject).toContain("terminou");
    vi.unstubAllEnvs();
  });

  it("sem dono com e-mail confirmado o envio falha (fica para revisão)", async () => {
    const db = await createTestDb();
    const tenant = await withOwner(db, false);
    await expect(sendTrialNotice(db, tenant.id, "ending", new Date())).rejects.toThrow("Sem destinatário");
    expect(sent.mail).not.toHaveBeenCalled();
  });
});
