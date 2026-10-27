import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/types";
import { createSession } from "@/server/auth/session";
import { startSupport } from "@/server/platform/support";
import { createTestDb } from "../helpers/test-db";
import { seedPlatformTenant, seedSuperAdmin } from "../helpers/platform-fixtures";

const state = vi.hoisted(() => ({ db: undefined as unknown, token: undefined as string | undefined }));
vi.mock("@/db/client", () => ({ getDb: async () => state.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "ea_session" && state.token ? { value: state.token } : undefined),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("@/app/admin/actions", () => ({ leaveSupportAction: vi.fn() }));

import { ReadOnlyBanner, READ_ONLY_TEXT } from "@/components/panel/read-only-banner";
import { SupportBanner } from "@/components/panel/support-banner";
import { ToastProvider } from "@/components/ui/toast";

describe("faixa de somente leitura", () => {
  it("usa o texto e as cores do design, sem botão quando não há WhatsApp de suporte", () => {
    const html = renderToStaticMarkup(h(ReadOnlyBanner, { whatsappUrl: null }));
    expect(html).toContain(READ_ONLY_TEXT);
    expect(READ_ONLY_TEXT).toBe(
      "Sua agenda está em modo somente leitura: a página de agendamento está fora do ar e não dá para marcar novos horários.",
    );
    expect(html).toContain("#FFF1E8");
    expect(html).toContain("#9A3412");
    expect(html).not.toContain("Falar com a Eneven");
  });

  it("com WhatsApp de suporte mostra 'Falar com a Eneven' apontando para o link", () => {
    const html = renderToStaticMarkup(h(ReadOnlyBanner, { whatsappUrl: "https://wa.me/5511999999999?text=Ol%C3%A1" }));
    expect(html).toContain("Falar com a Eneven");
    expect(html).toContain('href="https://wa.me/5511999999999?text=Ol%C3%A1"');
  });
});

describe("faixa do modo suporte", () => {
  it("diz em qual estabelecimento o super-admin está e oferece 'Voltar à plataforma'", () => {
    const html = renderToStaticMarkup(
      h(ToastProvider, null, h(SupportBanner, { tenantName: "Studio Aurora" })),
    );
    expect(html).toContain("Você está vendo como");
    expect(html).toContain("<strong");
    expect(html).toContain("Studio Aurora");
    expect(html).toContain("(suporte)");
    expect(html).toContain("Voltar à plataforma");
    expect(html).toContain("data-support-banner");
  });
});

describe("dados do painel em modo suporte", () => {
  let db: Db;
  beforeEach(async () => {
    vi.resetModules();
    db = await createTestDb();
    state.db = db;
  });

  it("o super-admin, sem vínculo com o estabelecimento, abre o painel dele (sem redirecionar)", async () => {
    const admin = await seedSuperAdmin(db);
    const { tenant } = await seedPlatformTenant(db, { name: "Studio Aurora" });
    state.token = await createSession(db, admin.id, null);
    await startSupport(db, state.token, { userId: admin.id }, tenant.id);

    const { getPanelData } = await import("@/server/panel/data");
    const data = await getPanelData();
    expect(data).toMatchObject({
      tenantName: "Studio Aurora",
      userName: "Ricardo",
      session: { support: true, role: "owner", tenantId: tenant.id },
    });
  });

  it("sem suporte e sem vínculo, continua indo para /entrar", async () => {
    const admin = await seedSuperAdmin(db);
    const { tenant } = await seedPlatformTenant(db);
    state.token = await createSession(db, admin.id, tenant.id);
    const { getPanelData } = await import("@/server/panel/data");
    await expect(getPanelData()).rejects.toThrow("NEXT_REDIRECT:/entrar");
  });
});
