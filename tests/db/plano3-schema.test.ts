import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { invitations, plans, professionals, tenants, users } from "@/db/schema";
import { migrationsFolder } from "@/db/migrate";
import { createSession } from "@/server/auth/session";
import { createTenantWithOwner } from "@/server/auth/signup";
import { DEFAULT_PLAN_CODE, getDefaultPlanId } from "@/server/platform/plans";
import { RESERVED_SLUGS, generateUniqueSlug } from "@/server/tenants/slug";
import { withTenant } from "@/server/tenant-db";
import { seedProfessional, seedTenant } from "../helpers/agenda-fixtures";
import {
  expectEveryAgendaAppTableHasRls,
  expectRlsViolation,
  failure,
  queryRows,
} from "../helpers/db-assertions";
import { createTestDb } from "../helpers/test-db";

const future = () => new Date(Date.now() + 86_400_000);

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
    expiresAt: future(),
    ...over,
  };
}

describe("planos", () => {
  it("a migração semeia Essencial, Profissional e Studio", async () => {
    const db = await createTestDb();
    const rows = await db.select().from(plans).orderBy(plans.sortOrder);
    expect(
      rows.map((p) => ({
        code: p.code,
        name: p.name,
        priceCents: p.priceCents,
        maxProfessionals: p.maxProfessionals,
        monthlyMessages: p.monthlyMessages,
        active: p.active,
      })),
    ).toEqual([
      { code: "essencial", name: "Essencial", priceCents: 3990, maxProfessionals: 2, monthlyMessages: 300, active: true },
      { code: "profissional", name: "Profissional", priceCents: 6990, maxProfessionals: 6, monthlyMessages: 800, active: true },
      { code: "studio", name: "Studio", priceCents: 10990, maxProfessionals: null, monthlyMessages: 1500, active: true },
    ]);
  });

  it("getDefaultPlanId devolve o Essencial", async () => {
    const db = await createTestDb();
    const [essencial] = await db.select().from(plans).where(eq(plans.code, DEFAULT_PLAN_CODE));
    expect(DEFAULT_PLAN_CODE).toBe("essencial");
    expect(await getDefaultPlanId(db)).toBe(essencial.id);
  });

  it("createTenantWithOwner coloca o estabelecimento no Essencial", async () => {
    const db = await createTestDb();
    const created = await createTenantWithOwner(db, {
      businessName: "Loja Plano",
      ownerName: "Ana",
      email: "ana@plano.com",
      whatsapp: "5511999990000",
      passwordHash: null,
      emailVerifiedAt: null,
    });
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, created.tenantId));
    expect(tenant.planId).toBe(await getDefaultPlanId(db));
    expect(tenant.activatedAt).toBeNull();
  });

  it("tenants.plan_id é obrigatório e plano em uso não pode ser apagado", async () => {
    const db = await createTestDb();
    const noPlan = await failure(
      db.execute(sql`insert into tenants (slug, name, trial_ends_at) values ('x', 'x', now())`),
    );
    expect(noPlan).not.toBeNull();
    await seedTenant(db, "em-uso");
    const restricted = await failure(db.delete(plans).where(eq(plans.code, "essencial")));
    expect(restricted).not.toBeNull();
  });

  it("agenda_app não tem acesso a plans", async () => {
    const db = await createTestDb();
    const [row] = await queryRows<{ s: boolean; i: boolean; u: boolean; d: boolean }>(
      db,
      sql`select has_table_privilege('agenda_app', 'plans', 'select') as s,
                 has_table_privilege('agenda_app', 'plans', 'insert') as i,
                 has_table_privilege('agenda_app', 'plans', 'update') as u,
                 has_table_privilege('agenda_app', 'plans', 'delete') as d`,
    );
    expect(row).toEqual({ s: false, i: false, u: false, d: false });
  });
});

describe("migração com estabelecimento existente", () => {
  it("0004 + 0005 preenchem plan_id com o Essencial nos tenants antigos", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "mig-antes-"));
    const client = new PGlite({ extensions: { btree_gist } });
    try {
      const source = migrationsFolder();
      await cp(source, tmp, { recursive: true });
      // Banco "antigo": só até 0003.
      const journalPath = path.join(tmp, "meta", "_journal.json");
      const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
        entries: { idx: number }[];
      };
      await writeFile(
        journalPath,
        JSON.stringify({ ...journal, entries: journal.entries.filter((e) => e.idx <= 3) }),
      );
      const db = drizzle(client, { schema });
      await migrate(db, { migrationsFolder: tmp });
      await client.exec(
        `insert into tenants (slug, name, trial_ends_at) values ('antigo', 'Antigo', now())`,
      );

      // Aplica o restante (0004 e 0005) a partir da pasta real.
      await migrate(db, { migrationsFolder: source });

      const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, "antigo"));
      expect(tenant.planId).toBe(await getDefaultPlanId(db));
    } finally {
      await client.close();
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("sessões e usuários", () => {
  it("createSession preenche users.last_login_at", async () => {
    const db = await createTestDb();
    const [user] = await db
      .insert(users)
      .values({ email: "u@exemplo.com", name: "U" })
      .returning();
    expect(user.lastLoginAt).toBeNull();
    const before = Date.now();
    await createSession(db, user.id, null);
    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after.lastLoginAt).toBeInstanceOf(Date);
    expect(after.lastLoginAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe("slug reservado", () => {
  it("convite é reservado e não é gerado no cadastro", async () => {
    const db = await createTestDb();
    expect(RESERVED_SLUGS).toContain("convite");
    expect(await generateUniqueSlug(db, "Convite")).toBe("convite-2");
  });
});

describe("invitations", () => {
  async function setup() {
    const db = await createTestDb();
    const a = await seedTenant(db, "loja-a");
    const b = await seedTenant(db, "loja-b");
    const proA = await seedProfessional(db, a.id);
    const proB = await seedProfessional(db, b.id);
    return { db, a, b, proA, proB };
  }

  it("enxerga só convites do próprio tenant e recusa insert em outro", async () => {
    const { db, a, b } = await setup();
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

  it("invitations entra na verificação de RLS do agenda_app", async () => {
    const db = await createTestDb();
    await expectEveryAgendaAppTableHasRls(db);
  });

  it("e-mail precisa estar em minúsculas e token é único", async () => {
    const { db, a } = await setup();
    expect(
      await failure(db.insert(invitations).values(invitationValues(a.id, { email: "Nova@Exemplo.com" }))),
    ).not.toBeNull();
    await db.insert(invitations).values(invitationValues(a.id, { tokenHash: "t1" }));
    expect(
      await failure(db.insert(invitations).values(invitationValues(a.id, { tokenHash: "t1" }))),
    ).not.toBeNull();
  });

  it("recusa profissional de outro tenant (FK composta)", async () => {
    const { db, a, proB } = await setup();
    const error = await failure(
      db.insert(invitations).values(invitationValues(a.id, { professionalId: proB.id })),
    );
    expect(error).not.toBeNull();
  });

  it("apagar o profissional anula só professional_id (tenant_id fica)", async () => {
    const { db, a, proA } = await setup();
    const [inv] = await db
      .insert(invitations)
      .values(invitationValues(a.id, { professionalId: proA.id }))
      .returning();
    await db.delete(professionals).where(eq(professionals.id, proA.id));
    const [after] = await db.select().from(invitations).where(eq(invitations.id, inv.id));
    expect(after.professionalId).toBeNull();
    expect(after.tenantId).toBe(a.id);
  });
});
