import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  auditLog,
  billingInvoices,
  billingSubscriptions,
  bookings,
  customers,
  memberships,
  professionals,
  sessions,
  tenants,
  users,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { AccountDeletionError } from "@/server/account/errors";
import { deleteAccount } from "@/server/account/delete-account";
import { createSession } from "@/server/auth/session";
import { resetRateLimitsForTests } from "@/server/security/limits";
import { acceptInvitation } from "@/server/team/accept";
import { inviteMemberForTests as inviteMember } from "@/server/team/invitations";
import { seedBooking } from "../helpers/agenda-fixtures";
import { NOW, seedOwnerTenant } from "../helpers/team-fixtures";
import { createTestDb } from "../helpers/test-db";

const PASSWORD = "senha-forte-1";

describe("exclusão de conta", () => {
  let db: Db;
  let tenantId: string;
  let ownerId: string;
  const cancelBilling = vi.fn(async () => {});

  async function join(role: "reception" | "staff", email: string, professionalId?: string) {
    const owner = { tenantId, userId: ownerId, role: "owner" as const };
    const { token } = await inviteMember(db, owner, { name: email, email, role, professionalId }, NOW);
    return acceptInvitation(db, token, { name: `Nome ${email}`, password: "senha-da-equipe-1" }, NOW);
  }

  const failure = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      expect(error).toBeInstanceOf(AccountDeletionError);
      return error as AccountDeletionError;
    }
    throw new Error("esperava AccountDeletionError");
  };

  beforeEach(async () => {
    resetRateLimitsForTests();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    cancelBilling.mockClear();
    cancelBilling.mockResolvedValue(undefined);
    db = await createTestDb();
    const t = await seedOwnerTenant(db, "Studio Aurora", "dona@studio.com");
    tenantId = t.tenantId;
    ownerId = t.userId;
  });

  it("exige a palavra EXCLUIR e não apaga nada sem ela", async () => {
    const error = await failure(deleteAccount(db, { userId: ownerId, tenantId, confirmation: "talvez", password: PASSWORD }, { cancelBilling }));
    expect(error.code).toBe("confirmation");
    expect(await db.select().from(tenants).where(eq(tenants.id, tenantId))).toHaveLength(1);
    expect(cancelBilling).not.toHaveBeenCalled();
  });

  it("aceita a palavra em qualquer caixa, com espaços nas pontas", async () => {
    await deleteAccount(db, { userId: ownerId, tenantId, confirmation: "  excluir ", password: PASSWORD }, { cancelBilling });
    expect(await db.select().from(tenants).where(eq(tenants.id, tenantId))).toHaveLength(0);
  });

  it("recusa senha errada em conta com senha, sem apagar nem cancelar a cobrança", async () => {
    const error = await failure(deleteAccount(db, { userId: ownerId, tenantId, confirmation: "EXCLUIR", password: "errada" }, { cancelBilling }));
    expect(error.code).toBe("password");
    expect(await db.select().from(tenants).where(eq(tenants.id, tenantId))).toHaveLength(1);
    expect(cancelBilling).not.toHaveBeenCalled();
  });

  it("conta só do Google (sem senha) confirma só com a palavra", async () => {
    await db.update(users).set({ passwordHash: null }).where(eq(users.id, ownerId));
    await deleteAccount(db, { userId: ownerId, tenantId, confirmation: "EXCLUIR", password: "" }, { cancelBilling });
    expect(await db.select().from(users).where(eq(users.id, ownerId))).toHaveLength(0);
  });

  it("proprietário: apaga estabelecimento, agenda, cobranças, sessões e a conta; equipe órfã também", async () => {
    await seedBooking(db, tenantId);
    const [subscription] = await db.insert(billingSubscriptions).values({ tenantId, planId: (await db.select().from(tenants).where(eq(tenants.id, tenantId)))[0].planId, providerStatus: "authorized", providerId: "sub-1", priceCents: 3990 }).returning();
    await db.insert(billingInvoices).values({ tenantId, subscriptionId: subscription.id, providerId: "inv-1", providerStatus: "approved", amountCents: 3990 });
    const staff = await join("reception", "rita@x.com");
    await createSession(db, ownerId, tenantId);

    const result = await deleteAccount(db, { userId: ownerId, tenantId, confirmation: "EXCLUIR", password: PASSWORD }, { cancelBilling });

    expect(result).toEqual({ scope: "owner", userDeleted: true });
    expect(cancelBilling).toHaveBeenCalledWith({ tenantId, ownerUserId: ownerId });
    expect(await db.select().from(tenants).where(eq(tenants.id, tenantId))).toHaveLength(0);
    expect(await db.select().from(bookings)).toHaveLength(0);
    expect(await db.select().from(customers)).toHaveLength(0);
    expect(await db.select().from(professionals)).toHaveLength(0);
    expect(await db.select().from(billingSubscriptions)).toHaveLength(0);
    expect(await db.select().from(billingInvoices)).toHaveLength(0);
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect(await db.select().from(memberships)).toHaveLength(0);
    expect(await db.select().from(users).where(eq(users.id, ownerId))).toHaveLength(0);
    expect(await db.select().from(users).where(eq(users.id, staff.userId))).toHaveLength(0);
  });

  it("proprietário: guarda na auditoria só identificadores, sem nome nem e-mail", async () => {
    await deleteAccount(db, { userId: ownerId, tenantId, confirmation: "EXCLUIR", password: PASSWORD }, { cancelBilling });
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, "account.deleted"));
    expect(entry).toMatchObject({ actorUserId: null, tenantId: null, details: { scope: "owner", tenantId } });
    const text = JSON.stringify(entry.details);
    expect(text).not.toContain("dona@studio.com");
    expect(text).not.toContain("Studio Aurora");
  });

  it("falha ao cancelar a cobrança: nada é apagado", async () => {
    cancelBilling.mockRejectedValueOnce(new Error("provedor fora do ar"));
    const error = await failure(deleteAccount(db, { userId: ownerId, tenantId, confirmation: "EXCLUIR", password: PASSWORD }, { cancelBilling }));
    expect(error.code).toBe("billing");
    expect(await db.select().from(tenants).where(eq(tenants.id, tenantId))).toHaveLength(1);
    expect(await db.select().from(users).where(eq(users.id, ownerId))).toHaveLength(1);
  });

  it("recepção: apaga só a própria conta; o estabelecimento e a cobrança ficam", async () => {
    const staff = await join("reception", "rita@x.com");
    const result = await deleteAccount(db, { userId: staff.userId, tenantId, confirmation: "EXCLUIR", password: "senha-da-equipe-1" }, { cancelBilling });
    expect(result).toEqual({ scope: "member", userDeleted: true });
    expect(cancelBilling).not.toHaveBeenCalled();
    expect(await db.select().from(users).where(eq(users.id, staff.userId))).toHaveLength(0);
    expect(await db.select().from(tenants).where(eq(tenants.id, tenantId))).toHaveLength(1);
    expect(await db.select().from(users).where(eq(users.id, ownerId))).toHaveLength(1);
  });

  it("profissional: o registro na equipe fica, sem ligação com a conta apagada", async () => {
    const [pro] = await db.insert(professionals).values({ tenantId, name: "Caio" }).returning();
    const staff = await join("staff", "caio@x.com", pro.id);
    expect((await db.select().from(professionals).where(eq(professionals.id, pro.id)))[0].userId).toBe(staff.userId);
    await deleteAccount(db, { userId: staff.userId, tenantId, confirmation: "EXCLUIR", password: "senha-da-equipe-1" }, { cancelBilling });
    const [after] = await db.select().from(professionals).where(eq(professionals.id, pro.id));
    expect(after).toMatchObject({ name: "Caio", userId: null });
  });

  it("administração da plataforma não se exclui por aqui", async () => {
    await db.update(users).set({ isSuperAdmin: true }).where(eq(users.id, ownerId));
    const error = await failure(deleteAccount(db, { userId: ownerId, tenantId, confirmation: "EXCLUIR", password: PASSWORD }, { cancelBilling }));
    expect(error.code).toBe("super_admin");
    expect(await db.select().from(tenants).where(eq(tenants.id, tenantId))).toHaveLength(1);
  });

  it("quem não pertence ao estabelecimento da sessão não apaga nada", async () => {
    const other = await seedOwnerTenant(db, "Outro Salão", "outra@salao.com");
    const error = await failure(deleteAccount(db, { userId: other.userId, tenantId, confirmation: "EXCLUIR", password: PASSWORD }, { cancelBilling }));
    expect(error.code).toBe("forbidden");
    expect(await db.select().from(tenants).where(eq(tenants.id, tenantId))).toHaveLength(1);
    expect(await db.select().from(tenants).where(eq(tenants.id, other.tenantId))).toHaveLength(1);
  });

  it("conta com acesso a outro estabelecimento mantém a conta e perde só este acesso", async () => {
    const staff = await join("reception", "rita@x.com");
    const other = await seedOwnerTenant(db, "Outro Salão", "outra@salao.com");
    await db.insert(memberships).values({ userId: staff.userId, tenantId: other.tenantId, role: "reception" });
    const result = await deleteAccount(db, { userId: ownerId, tenantId, confirmation: "EXCLUIR", password: PASSWORD }, { cancelBilling });
    expect(result.scope).toBe("owner");
    expect(await db.select().from(users).where(eq(users.id, staff.userId))).toHaveLength(1);
    expect((await db.select().from(memberships).where(eq(memberships.userId, staff.userId))).map((m) => m.tenantId)).toEqual([other.tenantId]);
  });

  it("a senha conferida é a do próprio usuário, não a de outra conta", async () => {
    const error = await failure(deleteAccount(db, { userId: ownerId, tenantId, confirmation: "EXCLUIR", password: "senha-da-equipe-1" }, { cancelBilling }));
    expect(error.code).toBe("password");
  });
});
