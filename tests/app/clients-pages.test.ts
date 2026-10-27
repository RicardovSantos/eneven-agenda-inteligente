import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("guarda: páginas de clientes", () => {
  const root = path.resolve(__dirname, "../../src/app/painel/clientes");
  it.each(["page.tsx", "[id]/page.tsx"])("%s chama requireOnboarded", (file) => {
    expect(readFileSync(path.join(root, file), "utf8")).toContain("requireOnboarded(");
  });
});
