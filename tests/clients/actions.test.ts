import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { customers } from "@/db/schema";
import type { Db } from "@/db/types";
import { createTestDb } from "../helpers/test-db";
import { seedTenant } from "../helpers/agenda-fixtures";

const state = vi.hoisted(() => ({
  db: undefined as unknown,
  session: undefined as unknown,
}));

vi.mock("@/db/client", () => ({ getDb: async () => state.db }));
vi.mock("@/server/auth/guard", () => ({
  requireTenantSession: async () => state.session,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import {
  createClientAction,
  updateClientAction,
  updateClientNotesAction,
} from "@/app/painel/clientes/actions";

let db: Db;
let tenantId: string;

const seedCustomer = async (_db: Db, tenant: string, v: { name: string; phone: string }) =>
  (await db.insert(customers).values({ tenantId: tenant, ...v }).returning())[0];

const asRole = (role: "owner" | "reception" | "staff") => {
  state.session = { userId: "u1", tenantId, role, isSuperAdmin: false, emailVerified: true };
};

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  tenantId = (await seedTenant(db, "salao-a")).id;
  asRole("owner");
});

describe("ações de clientes", () => {
  it("cria o cliente e devolve o id", async () => {
    const result = await createClientAction({ name: "Ana Souza", phone: "(11) 98123-4321", email: "", notes: "" });
    expect(result).toMatchObject({ ok: true, message: "Cliente salvo" });
    const [row] = await db.select().from(customers).where(eq(customers.tenantId, tenantId));
    expect(row).toMatchObject({ name: "Ana Souza", phone: "5511981234321" });
    expect(result.ok && result.id).toBe(row.id);
  });

  it("telefone repetido devolve erro no campo e o id de quem já usa", async () => {
    const existing = await seedCustomer(db, tenantId, { name: "Paula", phone: "5511981234321" });
    const result = await createClientAction({ name: "Outra", phone: "(11) 98123-4321" });
    expect(result).toMatchObject({
      ok: false,
      error: "Já existe um cliente com esse WhatsApp.",
      fieldErrors: { phone: "Já existe um cliente com esse WhatsApp." },
      existingId: existing.id,
    });
  });

  it("dados inválidos devolvem erro por campo", async () => {
    const result = await createClientAction({ name: "", phone: "123" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toMatchObject({
        name: "Informe o nome.",
        phone: "Informe um WhatsApp válido com DDD.",
      });
    }
  });

  it("entrada que não é objeto vira erro, sem estourar", async () => {
    expect(await createClientAction(null)).toMatchObject({ ok: false });
    expect(await createClientAction("x")).toMatchObject({ ok: false });
  });

  it("staff não cria nem edita dados, mas a recepção sim", async () => {
    asRole("staff");
    expect(await createClientAction({ name: "Ana", phone: "11981234321" })).toMatchObject({
      ok: false,
      error: "Você não tem permissão para fazer isso.",
    });
    const existing = await seedCustomer(db, tenantId, { name: "Paula", phone: "5511981234321" });
    expect(await updateClientAction(existing.id, { name: "Nova", phone: "11981234321" })).toMatchObject({
      ok: false,
    });

    asRole("reception");
    expect(await updateClientAction(existing.id, { name: "Nova", phone: "11981234321" })).toMatchObject({
      ok: true,
      message: "Alterações salvas",
    });
    const [row] = await db.select().from(customers).where(eq(customers.id, existing.id));
    expect(row.name).toBe("Nova");
  });

  it("observações salvam e respeitam o limite", async () => {
    const existing = await seedCustomer(db, tenantId, { name: "Paula", phone: "5511981234321" });
    expect(await updateClientNotesAction(existing.id, "Alergia a níquel")).toMatchObject({
      ok: true,
      message: "Observações salvas",
    });
    const [row] = await db.select().from(customers).where(eq(customers.id, existing.id));
    expect(row.notes).toBe("Alergia a níquel");
    expect(await updateClientNotesAction(existing.id, "x".repeat(501))).toMatchObject({ ok: false });
  });

  it("cliente de outro estabelecimento não é encontrado", async () => {
    const other = (await seedTenant(db, "salao-b")).id;
    const foreign = await seedCustomer(db, other, { name: "Alheia", phone: "5511999990000" });
    expect(await updateClientNotesAction(foreign.id, "oi")).toMatchObject({
      ok: false,
      error: "Cliente não encontrado.",
    });
  });
});
