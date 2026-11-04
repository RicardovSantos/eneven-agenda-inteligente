import { beforeEach, describe, expect, it, vi } from "vitest";
import { tenantNotificationSettings } from "@/db/schema";
import type { Db } from "@/db/types";
import { withTenant } from "@/server/tenant-db";
import { createTestDb } from "../helpers/test-db";
import { seedTenant } from "../helpers/agenda-fixtures";

const state = vi.hoisted(() => ({ db: undefined as unknown, session: undefined as unknown }));
vi.mock("@/db/client", () => ({ getDb: async () => state.db }));
vi.mock("@/server/auth/guard", () => ({ requireTenantSession: async () => state.session }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { saveWhatsAppSettings, saveWhatsAppSettingsAction } from "@/app/painel/configuracoes/mensagens/actions";

let db: Db;
let tenantId: string;
beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  tenantId = (await seedTenant(db)).id;
});

describe("preferências de WhatsApp", () => {
  it.each(["staff", "reception"])("recusa %s", async (role) => {
    state.session = { tenantId, role };
    await expect(saveWhatsAppSettings(new FormData())).rejects.toThrow();
    expect(await withTenant(db, tenantId, (tx) => tx.select().from(tenantNotificationSettings))).toHaveLength(0);
  });
  it("recusa habilitar lembrete de duas horas no plano Essencial", async () => {
    state.session = { tenantId, role: "owner" };
    const form = new FormData();
    form.set("reminder2h", "on");
    await expect(saveWhatsAppSettings(form)).rejects.toThrow(/Profissional/);
  });
  it("salva as preferências do estabelecimento da sessão", async () => {
    state.session = { tenantId, role: "owner" };
    const form = new FormData();
    form.set("reminderEve", "on");
    await saveWhatsAppSettings(form);
    const [row] = await withTenant(db, tenantId, (tx) => tx.select().from(tenantNotificationSettings));
    expect(row).toMatchObject({ tenantId, reminderEve: true, bookingCreated: false });
  });
  describe("ação do formulário (com retorno para a tela)", () => {
    it("salvou: devolve o aviso de sucesso e grava", async () => {
      state.session = { tenantId, role: "owner" };
      const form = new FormData();
      form.set("canceled", "on");
      const result = await saveWhatsAppSettingsAction({}, form);
      expect(result).toMatchObject({ message: "Preferências salvas" });
      expect(result.error).toBeUndefined();
      expect(typeof result.at).toBe("number");
      const [row] = await withTenant(db, tenantId, (tx) => tx.select().from(tenantNotificationSettings));
      expect(row).toMatchObject({ canceled: true, reminderEve: false });
    });
    it("lembrete de 2 horas no Essencial: devolve o motivo, sem gravar", async () => {
      state.session = { tenantId, role: "owner" };
      const form = new FormData();
      form.set("reminder2h", "on");
      const result = await saveWhatsAppSettingsAction({}, form);
      expect(result.error).toMatch(/Profissional ou Studio/);
      expect(result.message).toBeUndefined();
      expect(await withTenant(db, tenantId, (tx) => tx.select().from(tenantNotificationSettings))).toHaveLength(0);
    });
    it("quem não é dono não grava e recebe um erro genérico", async () => {
      state.session = { tenantId, role: "staff" };
      const result = await saveWhatsAppSettingsAction({}, new FormData());
      expect(result.error).toBe("Não foi possível salvar agora. Tente novamente.");
      expect(await withTenant(db, tenantId, (tx) => tx.select().from(tenantNotificationSettings))).toHaveLength(0);
    });
  });
});
