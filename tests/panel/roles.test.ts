import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ role: "owner" as "owner" | "reception" | "staff" }));
const redirects = vi.hoisted(() => [] as string[]);
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirects.push(to);
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@/server/panel/onboarding-gate", () => ({
  requireOnboarded: async () => ({ session: { role: state.role }, timezone: "America/Sao_Paulo" }),
}));

import { navItemsFor } from "@/lib/panel-nav";
import { requirePanelRole } from "@/server/panel/roles";

const labels = (items: Array<{ label: string }>) => items.map((i) => i.label);

describe("navItemsFor", () => {
  it("proprietário: 6 itens, todos habilitados, Painel leva à visão geral", () => {
    const { sidebar, bottom } = navItemsFor("owner", false);
    expect(labels(sidebar)).toEqual(["Agenda", "Clientes", "Serviços", "Equipe", "Painel", "Configurações"]);
    expect(sidebar.every((i) => i.href)).toBe(true);
    expect(sidebar.find((i) => i.label === "Painel")?.href).toBe("/painel/visao-geral");
    expect(labels(bottom)).toEqual(["Agenda", "Clientes", "Painel", "Mais"]);
  });

  it("recepção: 4 itens; no celular Agenda, Clientes e Mais", () => {
    const { sidebar, bottom } = navItemsFor("reception", false);
    expect(labels(sidebar)).toEqual(["Agenda", "Clientes", "Serviços", "Equipe"]);
    expect(labels(bottom)).toEqual(["Agenda", "Clientes", "Mais"]);
  });

  it("profissional: 2 itens; no celular Agenda, Clientes e Mais", () => {
    const { sidebar, bottom } = navItemsFor("staff", false);
    expect(labels(sidebar)).toEqual(["Agenda", "Clientes"]);
    expect(labels(bottom)).toEqual(["Agenda", "Clientes", "Mais"]);
  });

  it("super-admin ganha Plataforma no fim do menu lateral, apontando para /admin", () => {
    for (const role of ["owner", "reception", "staff"] as const) {
      const { sidebar } = navItemsFor(role, true);
      expect(sidebar.at(-1)).toMatchObject({ label: "Plataforma", href: "/admin" });
      expect(navItemsFor(role, false).sidebar.some((i) => i.label === "Plataforma")).toBe(false);
    }
  });
});

describe("requirePanelRole", () => {
  beforeEach(() => {
    redirects.length = 0;
  });

  it("devolve os dados quando o papel é permitido", async () => {
    state.role = "owner";
    await expect(requirePanelRole(["owner"])).resolves.toMatchObject({ timezone: "America/Sao_Paulo" });
    expect(redirects).toEqual([]);
  });

  it("redireciona para /painel quando o papel não é permitido", async () => {
    state.role = "reception";
    await expect(requirePanelRole(["owner"])).rejects.toThrow("REDIRECT:/painel");
    state.role = "staff";
    await expect(requirePanelRole(["owner", "reception"])).rejects.toThrow("REDIRECT:/painel");
    state.role = "reception";
    await expect(requirePanelRole(["owner", "reception"])).resolves.toBeDefined();
  });
});
