import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { users } from "@/db/schema";
import type { Db } from "@/db/types";
import { createSession } from "@/server/auth/session";
import { signup } from "@/server/auth/signup";
import { createTestDb } from "../helpers/test-db";

const state = vi.hoisted(() => ({
  db: undefined as unknown,
  token: undefined as string | undefined,
}));

vi.mock("@/db/client", () => ({ getDb: async () => state.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "ea_session" && state.token ? { value: state.token } : undefined,
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

const redirectOf = async (promise: Promise<unknown>) =>
  (
    await promise.then(
      () => null,
      (e: unknown) => (e as Error).message,
    )
  );

describe("/ e /admin", () => {
  let db: Db;
  let ana: { userId: string; tenantId: string };
  let rootId: string;

  beforeEach(async () => {
    vi.resetModules();
    db = await createTestDb();
    state.db = db;
    state.token = undefined;
    ana = await signup(db, {
      businessName: "Defendi Studio",
      ownerName: "Ana",
      email: "ana@defendi.com",
      password: "senha-forte-1",
      whatsapp: "11999999999",
    });
    const [root] = await db
      .insert(users)
      .values({ email: "root@eneven.com", passwordHash: "x", name: "Root", isSuperAdmin: true })
      .returning();
    rootId = root.id;
  });

  describe("página inicial", () => {
    const home = async () => (await import("@/app/page")).default();

    it("sem sessão redireciona para /entrar", async () => {
      expect(await redirectOf(home())).toBe("NEXT_REDIRECT:/entrar");
    });

    it("com sessão de estabelecimento redireciona para /painel", async () => {
      state.token = await createSession(db, ana.userId, ana.tenantId);
      expect(await redirectOf(home())).toBe("NEXT_REDIRECT:/painel");
    });

    it("super-admin sem estabelecimento vai para /admin", async () => {
      state.token = await createSession(db, rootId, null);
      expect(await redirectOf(home())).toBe("NEXT_REDIRECT:/admin");
    });
  });

  describe("requireSuperAdminSession", () => {
    const require = async () => (await import("@/server/auth/guard")).requireSuperAdminSession();

    it("sem sessão: /entrar", async () => {
      expect(await redirectOf(require())).toBe("NEXT_REDIRECT:/entrar");
    });

    it("sessão de quem não é super-admin: /entrar", async () => {
      state.token = await createSession(db, ana.userId, ana.tenantId);
      expect(await redirectOf(require())).toBe("NEXT_REDIRECT:/entrar");
    });

    it("super-admin: devolve a sessão", async () => {
      state.token = await createSession(db, rootId, null);
      expect(await require()).toMatchObject({ userId: rootId, isSuperAdmin: true });
    });
  });

  describe("página /admin", () => {
    const page = async () => (await import("@/app/admin/page")).default();

    it("exige super-admin", async () => {
      expect(await redirectOf(page())).toBe("NEXT_REDIRECT:/entrar");
      state.token = await createSession(db, ana.userId, ana.tenantId);
      expect(await redirectOf(page())).toBe("NEXT_REDIRECT:/entrar");
    });

    it("mostra o título, o texto de construção e o botão Sair (POST /sair)", async () => {
      state.token = await createSession(db, rootId, null);
      const html = renderToStaticMarkup(await page());
      expect(html).toContain("Painel da plataforma");
      expect(html).toContain(
        "Em construção. Aqui você vai gerenciar os estabelecimentos, planos e assinaturas.",
      );
      expect(html).toMatch(/<form[^>]*action="\/sair"[^>]*method="post"|<form[^>]*method="post"[^>]*action="\/sair"/);
      expect(html).toContain("Sair");
    });
  });
});
