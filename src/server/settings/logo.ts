import { eq } from "drizzle-orm";
import sharp from "sharp";
import { tenantLogos, tenants } from "@/db/schema";
import type { Db } from "@/db/types";
import { withTenant } from "@/server/tenant-db";
import { validationError } from "./errors";

export const LOGO_MAX_BYTES = 1024 * 1024;
export const LOGO_SIZE = 256;
const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"];
const ALLOWED_FORMATS = ["png", "jpeg", "webp"];

const bad = (message: string) => validationError({ logo: message });

/** Caminho público do logo, com a versão para furar o cache de 5 minutos. */
export const logoUrlFor = (slug: string, version: Date) =>
  `/api/logo/${slug}?v=${version.getTime()}`;

/**
 * Valida (tipo, tamanho e o conteúdo real do arquivo), converte para PNG
 * quadrado de 256 px (`cover`) e guarda como o logo do estabelecimento.
 */
export async function uploadLogo(
  db: Db,
  tenantId: string,
  file: { mime: string; bytes: Buffer | Uint8Array },
): Promise<void> {
  if (!ALLOWED_MIME.includes(file.mime)) {
    throw bad("Envie uma imagem PNG, JPG ou WebP.");
  }
  if (file.bytes.byteLength === 0) throw bad("O arquivo está vazio.");
  if (file.bytes.byteLength > LOGO_MAX_BYTES) {
    throw bad("A imagem pode ter no máximo 1 MB.");
  }

  let png: Buffer;
  try {
    const input = Buffer.from(file.bytes);
    // Confere o formato pelo conteúdo, não pelo tipo declarado.
    const meta = await sharp(input).metadata();
    if (!meta.format || !ALLOWED_FORMATS.includes(meta.format)) {
      throw new Error("formato");
    }
    png = await sharp(input)
      .rotate()
      .resize(LOGO_SIZE, LOGO_SIZE, { fit: "cover" })
      .png()
      .toBuffer();
  } catch {
    throw bad("Não conseguimos ler essa imagem. Tente outro arquivo.");
  }

  const updatedAt = new Date();
  await withTenant(db, tenantId, (tx) =>
    tx
      .insert(tenantLogos)
      .values({ tenantId, mime: "image/png", data: png, updatedAt })
      .onConflictDoUpdate({
        target: tenantLogos.tenantId,
        set: { mime: "image/png", data: png, updatedAt },
      }),
  );

  const [tenant] = await db
    .select({ slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (tenant) {
    await db
      .update(tenants)
      .set({ logoUrl: logoUrlFor(tenant.slug, updatedAt) })
      .where(eq(tenants.id, tenantId));
  }
}

export async function removeLogo(db: Db, tenantId: string): Promise<void> {
  await withTenant(db, tenantId, (tx) =>
    tx.delete(tenantLogos).where(eq(tenantLogos.tenantId, tenantId)),
  );
  await db.update(tenants).set({ logoUrl: null }).where(eq(tenants.id, tenantId));
}

export async function getLogo(
  db: Db,
  tenantId: string,
): Promise<{ mime: string; data: Buffer; updatedAt: Date } | null> {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .select({
        mime: tenantLogos.mime,
        data: tenantLogos.data,
        updatedAt: tenantLogos.updatedAt,
      })
      .from(tenantLogos)
      .where(eq(tenantLogos.tenantId, tenantId))
      .limit(1),
  );
  return row ?? null;
}
