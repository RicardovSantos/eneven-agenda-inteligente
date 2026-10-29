import { beforeEach, describe, expect, it } from "vitest";
import { tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  MAX_SLUG_LENGTH,
  RESERVED_SLUGS,
  generateUniqueSlug,
  slugify,
} from "@/server/tenants/slug";
import { createTestDb } from "../helpers/test-db";
import { getDefaultPlanId } from "@/server/platform/plans";

describe("slugify", () => {
  it("remove apóstrofos, acentos e símbolos", () => {
    expect(slugify("Studio Harrod's Beleza & Cia")).toBe(
      "studio-harrods-beleza-cia",
    );
  });

  it("remove acentos", () => {
    expect(slugify("Ação Estética")).toBe("acao-estetica");
  });

  it("colapsa separadores e apara hífens", () => {
    expect(slugify("  --Clínica   São José--  ")).toBe("clinica-sao-jose");
  });

  it("usa 'estabelecimento' quando o nome fica vazio", () => {
    expect(slugify("!!!")).toBe("estabelecimento");
    expect(slugify("")).toBe("estabelecimento");
  });

  it("limita a 48 caracteres, cortando em hífen quando possível", () => {
    const slug = slugify(
      "Clínica de Estética e Bem-Estar Maria das Graças Oliveira Santos",
    );
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(slug).toBe("clinica-de-estetica-e-bem-estar-maria-das-gracas");
    expect(slug.endsWith("-")).toBe(false);
  });

  it("corta duro quando não há hífen", () => {
    const slug = slugify("a".repeat(100));
    expect(slug).toBe("a".repeat(MAX_SLUG_LENGTH));
  });
});

describe("generateUniqueSlug", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createTestDb();
    await db.insert(tenants).values({
      slug: "defendi",
      name: "Defendi",
      trialEndsAt: new Date(Date.now() + 86_400_000),
      planId: await getDefaultPlanId(db),
    });
  });

  it("retorna o slug livre sem sufixo", async () => {
    expect(await generateUniqueSlug(db, "Studio Livre")).toBe("studio-livre");
  });

  it("acrescenta -2 quando já existe", async () => {
    expect(await generateUniqueSlug(db, "Defendi")).toBe("defendi-2");
  });

  it("incrementa o sufixo em colisões sucessivas", async () => {
    await db.insert(tenants).values({
      slug: "defendi-2",
      name: "Defendi 2",
      trialEndsAt: new Date(Date.now() + 86_400_000),
      planId: await getDefaultPlanId(db),
    });
    expect(await generateUniqueSlug(db, "Defendi")).toBe("defendi-3");
  });

  it("evita slugs reservados", async () => {
    expect(await generateUniqueSlug(db, "Painel")).toBe("painel-2");
    for (const reserved of RESERVED_SLUGS) {
      expect(await generateUniqueSlug(db, reserved)).not.toBe(reserved);
    }
  });

  it("nome sem caracteres válidos vira estabelecimento", async () => {
    expect(await generateUniqueSlug(db, "!!!")).toMatch(
      /^estabelecimento(-\d+)?$/,
    );
  });

  it("respeita o limite de 48 caracteres mesmo com sufixo", async () => {
    const longName = "b".repeat(80);
    const first = await generateUniqueSlug(db, longName);
    await db.insert(tenants).values({
      slug: first,
      name: "Longo",
      trialEndsAt: new Date(Date.now() + 86_400_000),
      planId: await getDefaultPlanId(db),
    });
    const second = await generateUniqueSlug(db, longName);
    expect(second.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(second).not.toBe(first);
    expect(second.endsWith("-2")).toBe(true);
  });
});
