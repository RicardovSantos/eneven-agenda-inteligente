import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regra de segurança (R13): o token do convite nunca chega a quem convida.
 * Os emissores `...ForTests` (que devolvem o token) só podem aparecer na
 * definição (`src/server/team/invitations.ts`) e no seed do e2e.
 */
const SRC = join(process.cwd(), "src");
const TEAM_DIR = join(SRC, "server", "team");
// Qualquer outro arquivo, inclusive os demais de team/, falha.
const ALLOWED = new Set(
  ["src/server/team/invitations.ts", "src/app/api/e2e/seed/route.ts", "src/server/e2e/seed.ts"].map(
    (p) => p.split("/").join(sep),
  ),
);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx|mts|js|jsx)$/.test(entry) ? [full] : [];
  });
}

const outsideAllowed = () =>
  walk(SRC).filter((file) => !ALLOWED.has(relative(process.cwd(), file)));

const FUNCTION_FORM = /export\s+(?:async\s+)?function\s+(\w+ForTests)\b/g;
const CONST_FORM = /export\s+(?:const|let|var)\s+(\w+ForTests)\b/g;
const FOR_TESTS_IMPORT = /(?:import|export)\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;

/** Nomes `xForTests` exportados (function, async function, const/let/var, inclusive arrow e async arrow). */
export function collectIssuerNames(text: string): string[] {
  return [...text.matchAll(FUNCTION_FORM), ...text.matchAll(CONST_FORM)].map((m) => m[1]);
}

/** Algum nome da lista aparece no texto (como identificador inteiro). */
export function mentionsAny(text: string, names: string[]): boolean {
  return names.some((name) => new RegExp(String.raw`\b${name}\b`).test(text));
}

/**
 * Importa (ou reexporta) um identificador `xForTests` de um módulo da equipe:
 * pelo alias `@/server/team...` ou por caminho relativo (fora do módulo da
 * equipe um relativo só pode apontar para código do app).
 */
export function importsForTestsFromTeam(text: string): boolean {
  for (const m of text.matchAll(FOR_TESTS_IMPORT)) {
    const fromTeam = m[2].startsWith(".") || m[2].startsWith("@/server/team");
    if (fromTeam && /\w+ForTests\b/.test(m[1])) return true;
  }
  return false;
}

describe("detector da guarda (autoteste)", () => {
  it("coleta function, async function, const, let e arrow functions", () => {
    const sample = [
      "export function aForTests() {}",
      "export async function bForTests() {}",
      "export const cForTests = () => 1;",
      "export const dForTests = async () => 1;",
      "export let eForTests = function () {};",
      "export function normal() {}",
    ].join(String.fromCharCode(10));
    expect(collectIssuerNames(sample).sort()).toEqual([
      "aForTests",
      "bForTests",
      "cForTests",
      "dForTests",
      "eForTests",
    ]);
  });

  it("detecta o uso por nome, mas não nomes parecidos", () => {
    expect(mentionsAny("x = await inviteMemberForTests(db)", ["inviteMemberForTests"])).toBe(true);
    expect(mentionsAny("resetRateLimitsForTests()", ["inviteMemberForTests"])).toBe(false);
  });

  it("detecta import por alias, por caminho relativo, com apelido e reexportação", () => {
    const yes = [
      'import { inviteMemberForTests } from "@/server/team/invitations";',
      'import { inviteMemberForTests as invite } from "../../server/team/invitations";',
      'import { a, resendInvitationForTests } from "./invitations";',
      'export { createOwnerAccessInviteForTests } from "./x";',
    ];
    for (const sample of yes) expect(importsForTestsFromTeam(sample), sample).toBe(true);
    const no = [
      'import { inviteMember } from "@/server/team/invitations";',
      'import { resetRateLimitsForTests } from "node:test";',
    ];
    for (const sample of no) expect(importsForTestsFromTeam(sample), sample).toBe(false);
  });
});

describe("emissores de convite só para testes", () => {
  const issuerNames = walk(TEAM_DIR).flatMap((file) =>
    collectIssuerNames(readFileSync(file, "utf8")),
  );

  it("o módulo da equipe expõe os emissores conhecidos", () => {
    expect(issuerNames).toEqual(
      expect.arrayContaining([
        "inviteMemberForTests",
        "resendInvitationForTests",
        "createOwnerAccessInviteForTests",
      ]),
    );
  });

  it("nenhum arquivo de src/ fora da definição e do seed do e2e menciona um emissor", () => {
    const offenders = outsideAllowed()
      .filter((file) => mentionsAny(readFileSync(file, "utf8"), issuerNames))
      .map((file) => relative(process.cwd(), file));
    expect(offenders).toEqual([]);
  });

  it("nenhum arquivo de src/ fora da definição e do seed do e2e importa ForTests de um módulo da equipe", () => {
    const offenders = outsideAllowed()
      .filter((file) => importsForTestsFromTeam(readFileSync(file, "utf8")))
      .map((file) => relative(process.cwd(), file));
    expect(offenders).toEqual([]);
  });
});
