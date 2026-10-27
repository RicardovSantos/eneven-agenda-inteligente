import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { metadata as rootMetadata } from "@/app/site-metadata";
import { PWA_METADATA, buildManifest } from "@/lib/pwa-manifest";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("o PWA é só do painel e da autenticação", () => {
  it("o metadata raiz não aponta o manifest (nem /[slug] nem /agendamento herdam)", () => {
    expect(rootMetadata.manifest).toBeUndefined();
    expect(PWA_METADATA.manifest).toBe("/manifest.webmanifest");
  });

  it("não existe app/manifest.ts (a convenção injetaria o link em todas as páginas)", () => {
    for (const ext of ["ts", "js", "json"]) {
      expect(existsSync(path.join(process.cwd(), `src/app/manifest.${ext}`))).toBe(false);
    }
  });

  it("o manifest é servido por uma rota própria", async () => {
    const { GET } = await import("@/app/manifest.webmanifest/route");
    const response = await GET();
    expect(response.headers.get("content-type")).toMatch(/application\/manifest\+json/);
    expect(await response.json()).toEqual(JSON.parse(JSON.stringify(buildManifest())));
  });

  it("o layout raiz não registra o service worker; painel e autenticação sim", () => {
    expect(read("src/app/layout.tsx")).not.toContain("RegisterSw");
    for (const file of ["src/app/painel/layout.tsx", "src/app/(auth)/layout.tsx"]) {
      const source = read(file);
      expect(source).toContain("<RegisterSw />");
      expect(source).toContain("PWA_METADATA");
    }
  });
});
