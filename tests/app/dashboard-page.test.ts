import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../src/app/painel");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("guarda de papel das páginas do painel", () => {
  it.each(["visao-geral/page.tsx", "configuracoes/page.tsx"])("%s só para o proprietário", (file) => {
    expect(read(file)).toContain('requirePanelRole(["owner"])');
  });
  it.each(["servicos/page.tsx", "equipe/page.tsx"])("%s para proprietário e recepção", (file) => {
    expect(read(file)).toContain('requirePanelRole(["owner", "reception"])');
  });
});
