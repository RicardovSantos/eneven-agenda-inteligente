import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regra de segurança (R13): o token do convite nunca chega a quem convida.
 * Os emissores `...ForTests` (que devolvem o token) só podem aparecer no módulo
 * da equipe que os define e nos módulos de apoio do e2e.
 */
const SRC = join(process.cwd(), "src");
const TEAM_DIR = join(SRC, "server", "team");
const ALLOWED = new Set(
  ["src/app/api/e2e/seed/route.ts", "src/server/e2e/seed.ts"].map((p) => p.split("/").join(sep)),
);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx|mts|js|jsx)$/.test(entry) ? [full] : [];
  });
}

const outsideTeamAndSeed = () =>
  walk(SRC)
    .filter((file) => !file.startsWith(TEAM_DIR + sep))
    .filter((file) => !ALLOWED.has(relative(process.cwd(), file)));

describe("emissores de convite só para testes", () => {
  const issuerNames = walk(TEAM_DIR)
    .flatMap((file) => [
      ...readFileSync(file, "utf8").matchAll(/export\s+(?:async\s+)?function\s+(\w+ForTests)\b/g),
    ])
    .map((m) => m[1]);

  it("o módulo da equipe expõe os emissores conhecidos", () => {
    expect(issuerNames).toEqual(
      expect.arrayContaining([
        "inviteMemberForTests",
        "resendInvitationForTests",
        "createOwnerAccessInviteForTests",
      ]),
    );
  });

  it("nenhum arquivo de src/ (além do seed do e2e) usa um emissor ForTests da equipe", () => {
    const offenders = outsideTeamAndSeed()
      .filter((file) => {
        const text = readFileSync(file, "utf8");
        return issuerNames.some((name) => text.includes(name));
      })
      .map((file) => relative(process.cwd(), file));
    expect(offenders).toEqual([]);
  });

  it("nenhum arquivo de src/ (além do seed do e2e) importa ForTests de @/server/team", () => {
    const offenders = outsideTeamAndSeed()
      .filter((file) =>
        /import[^;]*ForTests[^;]*from\s+["']@\/server\/team/.test(readFileSync(file, "utf8")),
      )
      .map((file) => relative(process.cwd(), file));
    expect(offenders).toEqual([]);
  });
});
