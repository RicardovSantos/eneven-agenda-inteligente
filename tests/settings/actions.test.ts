import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tenants } from "@/db/schema";
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
  saveBookingRulesAction,
  saveBusinessInfoAction,
  saveHoursAction,
  saveSlugAction,
  uploadLogoAction,
  removeLogoAction,
  saveBrandColorAction,
} from "@/app/painel/configuracoes/actions";

let db: Db;
let tenantId: string;

const form = (values: Record<string, string | File>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

const asRole = (role: "owner" | "reception" | "staff") => {
  state.session = { userId: "u1", tenantId, role, isSuperAdmin: false, emailVerified: true };
};

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  tenantId = (await seedTenant(db, "salao-a")).id;
});

const name = async () =>
  (await db.select().from(tenants).where(eq(tenants.id, tenantId)))[0].name;

describe("ações de configurações: papel", () => {
  it.each(["staff", "reception"] as const)("%s não pode alterar nada", async (role) => {
    asRole(role);
    const info = await saveBusinessInfoAction(
      {},
      form({ name: "Invadido", whatsapp: "11987654321" }),
    );
    expect(info.error).toMatch(/proprietário/);
    expect(await name()).toBe("salao-a");

    const results = [
      await saveBrandColorAction({}, form({ color: "#3E07D2" })),
      await saveHoursAction({}, form({ hours: "{}" })),
      await saveBookingRulesAction(
        {},
        form({ slotIntervalMin: "15", minNoticeMin: "60", maxDaysAhead: "60", cancelWindowMin: "120" }),
      ),
      await saveSlugAction({}, form({ slug: "invadido" })),
      await uploadLogoAction({}, form({})),
      await removeLogoAction({}),
    ];
    for (const result of results) expect(result.error).toMatch(/proprietário/);
  });

  it("o proprietário salva, com o tenant vindo da sessão", async () => {
    asRole("owner");
    const result = await saveBusinessInfoAction(
      {},
      form({ name: "Novo Nome", whatsapp: "(11) 98765-4321", address: "", instagram: "", about: "" }),
    );
    expect(result.error).toBeUndefined();
    expect(result.message).toBe("Alterações salvas");
    expect(await name()).toBe("Novo Nome");
  });

  it("devolve erros por campo", async () => {
    asRole("owner");
    const result = await saveBusinessInfoAction(
      {},
      form({ name: "", whatsapp: "1", address: "", instagram: "", about: "" }),
    );
    expect(result.fieldErrors).toHaveProperty("name");
    expect(result.fieldErrors).toHaveProperty("whatsapp");
  });

  it("slug em uso volta como erro do campo", async () => {
    asRole("owner");
    await seedTenant(db, "ocupado");
    const result = await saveSlugAction({}, form({ slug: "ocupado" }));
    expect(result.fieldErrors?.slug).toBe("Esse link já está em uso.");
  });
});
