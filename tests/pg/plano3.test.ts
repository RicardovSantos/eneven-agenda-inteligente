import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { invitations, plans, professionals } from "@/db/schema";
import { withTenant } from "@/server/tenant-db";
import { seedProfessional, seedTenant } from "../helpers/agenda-fixtures";
import {
  expectEveryAgendaAppTableHasRls,
  expectRlsViolation,
  failure,
  queryRows,
} from "../helpers/db-assertions";
import { connectPg } from "./pg-db";

const pg = connectPg();
const { db } = pg;

beforeEach(async () => {
  await pg.truncate();
});

afterAll(async () => {
  await pg.close();
});

function invitationValues(
  tenantId: string,
  over: Partial<typeof invitations.$inferInsert> = {},
): typeof invitations.$inferInsert {
  return {
    tenantId,
    email: "nova@exemplo.com",
    name: "Nova",
    role: "staff",
    tokenHash: `hash-${Math.random().toString(36).slice(2)}`,
    expiresAt: new Date(Date.now() + 86_400_000),
    ...over,
  };
}

describe("Plano 3 (PostgreSQL real)", () => {
  it("planos semeados e plan_id obrigatório", async () => {
    const rows = await db.select().from(plans);
    expect(rows.map((p) => p.code).sort()).toEqual(["essencial", "profissional", "studio"]);
    const [col] = await queryRows<{ is_nullable: string }>(
      db,
      sql`select is_nullable from information_schema.columns
          where table_name = 'tenants' and column_name = 'plan_id'`,
    );
    expect(col.is_nullable).toBe("NO");
  });

  it("dentro de withTenant(A) não se lê convite de B e insert com tenantId de B falha", async () => {
    const a = await seedTenant(db, "loja-a");
    const b = await seedTenant(db, "loja-b");
    await db.insert(invitations).values(invitationValues(a.id));
    await db.insert(invitations).values(invitationValues(b.id));

    const seenByA = await withTenant(db, a.id, (tx) => tx.select().from(invitations));
    expect(seenByA).toHaveLength(1);
    expect(seenByA[0].tenantId).toBe(a.id);

    const error = await failure(
      withTenant(db, a.id, (tx) => tx.insert(invitations).values(invitationValues(b.id))),
    );
    expectRlsViolation(error);
  });

  it("invitations tem RLS e plans fica fora do alcance do agenda_app", async () => {
    await expectEveryAgendaAppTableHasRls(db);
    const [row] = await queryRows<{ s: boolean }>(
      db,
      sql`select has_table_privilege('agenda_app', 'plans', 'select') as s`,
    );
    expect(row.s).toBe(false);
  });

  it("apagar o profissional anula só professional_id do convite (tenant_id fica)", async () => {
    const a = await seedTenant(db, "loja-a");
    const pro = await seedProfessional(db, a.id);
    const [inv] = await db
      .insert(invitations)
      .values(invitationValues(a.id, { professionalId: pro.id }))
      .returning();
    await db.delete(professionals).where(eq(professionals.id, pro.id));
    const [after] = await db.select().from(invitations).where(eq(invitations.id, inv.id));
    expect(after.professionalId).toBeNull();
    expect(after.tenantId).toBe(a.id);
  });
});
