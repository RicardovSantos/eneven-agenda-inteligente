import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../src/app/admin");

function pagesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return pagesUnder(full);
    return name === "page.tsx" ? [full] : [];
  });
}

describe("guarda: páginas da plataforma (/admin)", () => {
  const pages = pagesUnder(root);

  it("existem as telas da plataforma", () => {
    const rel = pages.map((p) => path.relative(root, p).replaceAll("\\", "/")).sort();
    expect(rel).toEqual([
      "cobranca/page.tsx",
      "dados/page.tsx",
      "estabelecimentos/[id]/page.tsx",
      "estabelecimentos/novo/page.tsx",
      "notificacoes/page.tsx",
      "page.tsx",
      "planos/page.tsx",
      "whatsapp/page.tsx",
    ]);
  });

  it.each(pages.map((p) => [path.relative(root, p).replaceAll("\\", "/"), p]))(
    "%s chama requireSuperAdminSession(",
    (_name, file) => {
      expect(readFileSync(file, "utf8")).toContain("requireSuperAdminSession(");
    },
  );

  it("o layout também exige super-admin", () => {
    expect(readFileSync(path.join(root, "layout.tsx"), "utf8")).toContain("requireSuperAdminSession(");
  });

  it("toda ação de /admin passa por adminContext, que chama o guard", () => {
    const source = readFileSync(path.join(root, "actions.ts"), "utf8");
    expect(source.startsWith('"use server"')).toBe(true);
    const exported = source.match(/export async function \w+/g) ?? [];
    expect(exported.length).toBeGreaterThanOrEqual(8);
    expect(source).toMatch(/async function adminContext[\s\S]*requireSuperAdminSession\(/);
    // cada ação exportada usa o contexto (run/adminContext) logo no início
    for (const block of source.split(/export async function /).slice(1)) {
      expect(block).toMatch(/run\(|adminContext\(/);
    }
  });
});
