import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServiceWorker, hashBrandAssets } from "../../scripts/pwa/service-worker";

describe("service worker gerado", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "sw-"));
    await mkdir(join(root, "public/brand"), { recursive: true });
    await mkdir(join(root, "scripts/pwa"), { recursive: true });
    await writeFile(join(root, "public/brand/logo.png"), "logo-a");
    await writeFile(join(root, "public/brand/icon-32.png"), "icone");
    await writeFile(
      join(root, "scripts/pwa/sw.template.js"),
      'const CACHE_VERSION = "__BRAND_HASH__";\n',
    );
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  it("o hash muda quando um arquivo da marca muda", async () => {
    const before = await hashBrandAssets(join(root, "public/brand"));
    expect(before).toMatch(/^[0-9a-f]{10}$/);
    expect(await hashBrandAssets(join(root, "public/brand"))).toBe(before);

    await writeFile(join(root, "public/brand/logo.png"), "logo-b");
    expect(await hashBrandAssets(join(root, "public/brand"))).not.toBe(before);
  });

  it("o hash muda quando um arquivo é renomeado ou criado", async () => {
    const before = await hashBrandAssets(join(root, "public/brand"));
    await writeFile(join(root, "public/brand/novo.png"), "x");
    expect(await hashBrandAssets(join(root, "public/brand"))).not.toBe(before);
  });

  it("grava public/sw.js trocando __BRAND_HASH__ pelo hash", async () => {
    const hash = await buildServiceWorker(root);
    const sw = await readFile(join(root, "public/sw.js"), "utf8");
    expect(sw).toBe(`const CACHE_VERSION = "${hash}";\n`);
    expect(sw).not.toContain("__BRAND_HASH__");
  });

  it("trocar a logo muda o CACHE_VERSION gerado", async () => {
    await buildServiceWorker(root);
    const first = await readFile(join(root, "public/sw.js"), "utf8");
    await writeFile(join(root, "public/brand/logo.png"), "logo-nova");
    await buildServiceWorker(root);
    expect(await readFile(join(root, "public/sw.js"), "utf8")).not.toBe(first);
  });

  it("falha com mensagem clara se o modelo não tem o marcador", async () => {
    await writeFile(join(root, "scripts/pwa/sw.template.js"), "sem marcador");
    await expect(buildServiceWorker(root)).rejects.toThrow(/__BRAND_HASH__/);
  });
});

describe("modelo do service worker do projeto", () => {
  it("tem o marcador, pré-carrega o logo leve e não o logo grande", async () => {
    const template = await readFile("scripts/pwa/sw.template.js", "utf8");
    expect(template).toContain("__BRAND_HASH__");
    expect(template).toContain("/brand/logo-email.png");
    expect(template).not.toContain("/brand/logo.png");
    expect(template).not.toContain("/brand/logo-dark.png");
    expect(template).toContain("/brand/icon-192.png");
  });

  it("offline.html usa o logo leve", async () => {
    const html = await readFile("public/offline.html", "utf8");
    expect(html).toContain("/brand/logo-email.png");
    expect(html).not.toContain("/brand/logo.png");
    expect(html).not.toContain("/brand/logo-dark.png");
  });
});
