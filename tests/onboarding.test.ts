import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  businessHours,
  memberships,
  professionalHours,
  professionals,
  tenants,
  users,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { createTenantWithOwner, signup } from "@/server/auth/signup";
import {
  completeOnboarding,
  getOnboardingState,
  onboardingRedirect,
  skipOnboarding,
} from "@/server/onboarding";
import { ensureTenantDefaults } from "@/server/tenants/defaults";
import { saveService } from "@/server/catalog";
import { updateBranding, uploadLogo } from "@/server/settings";
import { withTenant, withTenantTx } from "@/server/tenant-db";
import { createTestDb } from "./helpers/test-db";
import { getDefaultPlanId } from "@/server/platform/plans";

const input = {
  businessName: "Defendi Studio",
  ownerName: "Ana Defendi",
  email: "ana@defendi.com",
  password: "senha-forte-1",
  whatsapp: "11999999999",
};

const hm = (t: string) => t.slice(0, 5);

const newOwner = (name: string, email: string, ownerName = name) => ({
  businessName: name,
  ownerName,
  email,
  whatsapp: "5511999990001",
  passwordHash: null,
  emailVerifiedAt: null,
});

describe("cadastro novo já nasce com horário e profissional", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("grava o horário padrão: seg-sex 09-18 e sáb 09-13", async () => {
    const { tenantId } = await signup(db, input);
    const rows = await withTenant(db, tenantId, (tx) =>
      tx.select().from(businessHours).orderBy(businessHours.weekday),
    );
    expect(rows.map((r) => [r.weekday, hm(r.startsAt), hm(r.endsAt)])).toEqual([
      [1, "09:00", "18:00"],
      [2, "09:00", "18:00"],
      [3, "09:00", "18:00"],
      [4, "09:00", "18:00"],
      [5, "09:00", "18:00"],
      [6, "09:00", "13:00"],
    ]);
  });

  it("cria o dono como primeiro profissional, com a cor da marca e o mesmo horário", async () => {
    const { tenantId, userId } = await signup(db, input);
    const pros = await withTenant(db, tenantId, (tx) => tx.select().from(professionals));
    expect(pros).toHaveLength(1);
    expect(pros[0]).toMatchObject({
      name: "Ana Defendi",
      color: "#3E07D2",
      active: true,
      userId,
      sortOrder: 0,
    });
    const hours = await withTenant(db, tenantId, (tx) =>
      tx.select().from(professionalHours).orderBy(professionalHours.weekday),
    );
    expect(hours).toHaveLength(6);
    expect(hours.every((h) => h.professionalId === pros[0].id)).toBe(true);
    expect(hours.map((h) => [h.weekday, hm(h.startsAt), hm(h.endsAt)])).toContainEqual([
      6,
      "09:00",
      "13:00",
    ]);
  });

  it("vale também para o cadastro pelo Google (createTenantWithOwner) e não vaza entre tenants", async () => {
    const a = await createTenantWithOwner(db, newOwner("Ana", "a@x.com"));
    const b = await createTenantWithOwner(db, newOwner("Beto", "b@x.com"));
    const prosA = await withTenant(db, a.tenantId, (tx) => tx.select().from(professionals));
    const prosB = await withTenant(db, b.tenantId, (tx) => tx.select().from(professionals));
    expect(prosA.map((p) => p.name)).toEqual(["Ana"]);
    expect(prosB.map((p) => p.name)).toEqual(["Beto"]);
  });

  it("trunca o nome do dono para o limite de nome de profissional (60)", async () => {
    const longName = "Maria ".repeat(20).trim(); // 119 caracteres
    const { tenantId } = await createTenantWithOwner(db, newOwner("Studio", "longo@x.com", longName));
    const [pro] = await withTenant(db, tenantId, (tx) => tx.select().from(professionals));
    expect(pro.name.length).toBeLessThanOrEqual(60);
    expect(pro.name).toBe(longName.slice(0, 60).trim());
  });

  it("o callback do cadastro roda como dono de novo (o papel do tenant não vaza)", async () => {
    let user = "";
    await createTenantWithOwner(db, newOwner("Cris", "c@x.com"), new Date(), async (tx) => {
      const result = (await tx.execute(sql`select current_user as u`)) as unknown as {
        rows: Array<{ u: string }>;
      };
      user = result.rows[0].u;
    });
    expect(user).not.toBe("agenda_app");
    expect(user).not.toBe("");
  });
});

describe("withTenantTx", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("aplica RLS dentro de uma transação existente e devolve o papel ao terminar", async () => {
    const { tenantId } = await signup(db, input);
    const other = await createTenantWithOwner(db, newOwner("Outro", "ze@x.com"));
    await db.transaction(async (tx) => {
      const seen = await withTenantTx(tx, tenantId, (t) => t.select().from(professionals));
      expect(seen.map((p) => p.name)).toEqual(["Ana Defendi"]);
      // Fora do bloco, de volta ao dono: enxerga os dois tenants.
      const all = await tx.select().from(professionals);
      expect(all).toHaveLength(2);
      expect(all.some((p) => p.tenantId === other.tenantId)).toBe(true);
    });
  });
});

describe("getOnboardingState / concluir / pular", () => {
  let db: Db;
  let tenantId: string;
  beforeEach(async () => {
    db = await createTestDb();
    ({ tenantId } = await signup(db, input));
  });

  it("estado inicial: etapa 1, com horário e só o dono na equipe", async () => {
    expect(await getOnboardingState(db, tenantId)).toEqual({
      step: 1,
      hasLogo: false,
      hasHours: true,
      servicesCount: 0,
      professionalsCount: 1,
    });
  });

  it("avança para a etapa 2 depois de salvar a marca (cor)", async () => {
    await updateBranding(db, tenantId, { color: "#0E7C86" });
    expect((await getOnboardingState(db, tenantId)).step).toBe(2);
  });

  it("vai para a etapa 4 com ao menos um serviço e conta serviços e profissionais ativos", async () => {
    await updateBranding(db, tenantId, { color: "#0E7C86" });
    const [{ id }] = await db.select({ id: professionals.id }).from(professionals);
    await saveService(db, tenantId, {
      name: "Corte",
      durationMin: 30,
      bufferAfterMin: 0,
      priceCents: 5000,
      visible: true,
      professionalIds: [id],
    });
    const state = await getOnboardingState(db, tenantId);
    expect(state.step).toBe(4);
    expect(state.servicesCount).toBe(1);
    expect(state.professionalsCount).toBe(1);
  });

  it("hasLogo reflete o logo enviado", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    );
    await uploadLogo(db, tenantId, { mime: "image/png", bytes: png });
    expect((await getOnboardingState(db, tenantId)).hasLogo).toBe(true);
  });

  it("completar marca como concluído (uma vez só) e o estado vira done", async () => {
    await completeOnboarding(db, tenantId);
    const [first] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    expect(first.onboardingCompletedAt).toBeInstanceOf(Date);
    expect((await getOnboardingState(db, tenantId)).step).toBe("done");

    await completeOnboarding(db, tenantId);
    const [second] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    expect(second.onboardingCompletedAt?.getTime()).toBe(first.onboardingCompletedAt?.getTime());
  });

  it("pular também conclui, sem mexer em outros estabelecimentos", async () => {
    const other = await createTenantWithOwner(db, newOwner("Outro", "ze@x.com"));
    await skipOnboarding(db, tenantId);
    expect((await getOnboardingState(db, tenantId)).step).toBe("done");
    expect((await getOnboardingState(db, other.tenantId)).step).toBe(1);
  });
});

describe("onboardingRedirect (painel redireciona até concluir ou pular)", () => {
  it("proprietário sem conclusão: toda página do painel leva ao assistente, que fica onde está", () => {
    expect(onboardingRedirect({ role: "owner", completed: false, page: "panel" })).toBe(
      "/painel/comecar",
    );
    expect(onboardingRedirect({ role: "owner", completed: false, page: "wizard" })).toBeNull();
  });

  it("depois de concluir ou pular, o painel abre e o assistente volta ao painel", () => {
    expect(onboardingRedirect({ role: "owner", completed: true, page: "panel" })).toBeNull();
    expect(onboardingRedirect({ role: "owner", completed: true, page: "wizard" })).toBe("/painel");
  });

  it("outros papéis pulam o assistente por completo", () => {
    for (const role of ["reception", "staff"] as const) {
      expect(onboardingRedirect({ role, completed: false, page: "panel" })).toBeNull();
      expect(onboardingRedirect({ role, completed: false, page: "wizard" })).toBe("/painel");
    }
  });
});

describe("ensureTenantDefaults (estabelecimentos anteriores ao seed)", () => {
  it("semeia horário e dono uma vez só, mesmo com chamadas repetidas e simultâneas", async () => {
    const db = await createTestDb();
    const [tenant] = await db
      .insert(tenants)
      .values({
        slug: "antigo",
        name: "Antigo",
        trialEndsAt: new Date(Date.now() + 86_400_000),
        planId: await getDefaultPlanId(db),
      })
      .returning();
    const [user] = await db
      .insert(users)
      .values({ email: "velho@x.com", name: "Dona Velha", passwordHash: null })
      .returning();
    await db
      .insert(memberships)
      .values({ userId: user.id, tenantId: tenant.id, role: "owner" });

    await Promise.all([
      ensureTenantDefaults(db, tenant.id),
      ensureTenantDefaults(db, tenant.id),
    ]);
    await ensureTenantDefaults(db, tenant.id);

    const hours = await withTenant(db, tenant.id, (tx) => tx.select().from(businessHours));
    const pros = await withTenant(db, tenant.id, (tx) => tx.select().from(professionals));
    const proHours = await withTenant(db, tenant.id, (tx) => tx.select().from(professionalHours));
    expect(hours).toHaveLength(6);
    expect(pros).toHaveLength(1);
    expect(pros[0]).toMatchObject({ name: "Dona Velha", userId: user.id, color: "#3E07D2" });
    expect(proHours).toHaveLength(6);
  });

  it("não mexe em quem já tem horário e profissionais", async () => {
    const db = await createTestDb();
    const { tenantId } = await signup(db, input);
    await ensureTenantDefaults(db, tenantId);
    const pros = await withTenant(db, tenantId, (tx) => tx.select().from(professionals));
    const hours = await withTenant(db, tenantId, (tx) => tx.select().from(businessHours));
    expect(pros).toHaveLength(1);
    expect(hours).toHaveLength(6);
  });
});

describe("guarda: páginas do painel exigem o assistente concluído", () => {
  const root = path.resolve(__dirname, "../src/app/painel");
  const pages = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return pages(full);
      return name === "page.tsx" ? [full] : [];
    });

  it("toda page.tsx (menos comecar) chama requireOnboarded", () => {
    const list = pages(root).filter((f) => !f.includes(`${path.sep}comecar${path.sep}`));
    expect(list.length).toBeGreaterThan(0);
    for (const file of list) {
      expect(readFileSync(file, "utf8"), file).toContain("requireOnboarded(");
    }
  });
});
