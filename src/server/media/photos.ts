import { and, eq } from "drizzle-orm";
import { professionalPhotos, professionals, tenantPhotos } from "@/db/schema";
import type { Db } from "@/db/types";
import { withTenant } from "@/server/tenant-db";
import { MediaError, WEBP_MIME, convertToWebp } from "./image";

/** Quantas imagens o carrossel da página pública aceita. */
export const HERO_SLOTS = 3;
export const HERO_SIZE = { width: 1600, height: 920 } as const;
export const PROFESSIONAL_PHOTO_SIZE = { width: 480, height: 480 } as const;

export type RawImage = { bytes: Buffer | Uint8Array };

export type StoredPhoto = { mime: string; data: Buffer; updatedAt: Date };

/** Endereço público da imagem do carrossel; `v` fura o cache quando ela troca. */
export const heroPhotoUrl = (slug: string, slot: number, version: Date) =>
  `/api/midia/${slug}/capa/${slot}?v=${version.getTime()}`;

export const professionalPhotoUrl = (slug: string, professionalId: string, version: Date) =>
  `/api/midia/${slug}/profissional/${professionalId}?v=${version.getTime()}`;

const invalidSlot = () => new MediaError("Posição de imagem inválida.");
const isSlot = (slot: number) => Number.isInteger(slot) && slot >= 0 && slot < HERO_SLOTS;

export async function saveHeroPhoto(
  db: Db,
  tenantId: string,
  slot: number,
  file: RawImage,
): Promise<void> {
  if (!isSlot(slot)) throw invalidSlot();
  const data = await convertToWebp(file.bytes, { ...HERO_SIZE, quality: 78 });
  const updatedAt = new Date();
  await withTenant(db, tenantId, (tx) =>
    tx
      .insert(tenantPhotos)
      .values({ tenantId, slot, mime: WEBP_MIME, data, updatedAt })
      .onConflictDoUpdate({
        target: [tenantPhotos.tenantId, tenantPhotos.slot],
        set: { mime: WEBP_MIME, data, updatedAt },
      }),
  );
}

export async function removeHeroPhoto(db: Db, tenantId: string, slot: number): Promise<void> {
  if (!isSlot(slot)) throw invalidSlot();
  await withTenant(db, tenantId, (tx) =>
    tx
      .delete(tenantPhotos)
      .where(and(eq(tenantPhotos.tenantId, tenantId), eq(tenantPhotos.slot, slot))),
  );
}

/** Posições preenchidas e a versão de cada uma (sem carregar os bytes). */
export async function listHeroPhotos(
  db: Db,
  tenantId: string,
): Promise<Array<{ slot: number; updatedAt: Date }>> {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .select({ slot: tenantPhotos.slot, updatedAt: tenantPhotos.updatedAt })
      .from(tenantPhotos)
      .where(eq(tenantPhotos.tenantId, tenantId))
      .orderBy(tenantPhotos.slot),
  );
  return rows;
}

export async function getHeroPhoto(
  db: Db,
  tenantId: string,
  slot: number,
): Promise<StoredPhoto | null> {
  if (!isSlot(slot)) return null;
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .select({ mime: tenantPhotos.mime, data: tenantPhotos.data, updatedAt: tenantPhotos.updatedAt })
      .from(tenantPhotos)
      .where(and(eq(tenantPhotos.tenantId, tenantId), eq(tenantPhotos.slot, slot)))
      .limit(1),
  );
  return row ?? null;
}

/** Guarda a foto e marca a versão no profissional; recusa profissional de outro tenant. */
export async function saveProfessionalPhoto(
  db: Db,
  tenantId: string,
  professionalId: string,
  file: RawImage,
): Promise<void> {
  const data = await convertToWebp(file.bytes, { ...PROFESSIONAL_PHOTO_SIZE, quality: 82 });
  const updatedAt = new Date();
  await withTenant(db, tenantId, async (tx) => {
    const updated = await tx
      .update(professionals)
      .set({ photoUpdatedAt: updatedAt })
      .where(and(eq(professionals.tenantId, tenantId), eq(professionals.id, professionalId)))
      .returning({ id: professionals.id });
    if (updated.length === 0) throw new MediaError("Profissional não encontrado.");
    await tx
      .insert(professionalPhotos)
      .values({ tenantId, professionalId, mime: WEBP_MIME, data, updatedAt })
      .onConflictDoUpdate({
        target: [professionalPhotos.tenantId, professionalPhotos.professionalId],
        set: { mime: WEBP_MIME, data, updatedAt },
      });
  });
}

export async function removeProfessionalPhoto(
  db: Db,
  tenantId: string,
  professionalId: string,
): Promise<void> {
  await withTenant(db, tenantId, async (tx) => {
    await tx
      .update(professionals)
      .set({ photoUpdatedAt: null })
      .where(and(eq(professionals.tenantId, tenantId), eq(professionals.id, professionalId)));
    await tx
      .delete(professionalPhotos)
      .where(
        and(
          eq(professionalPhotos.tenantId, tenantId),
          eq(professionalPhotos.professionalId, professionalId),
        ),
      );
  });
}

export async function getProfessionalPhoto(
  db: Db,
  tenantId: string,
  professionalId: string,
): Promise<StoredPhoto | null> {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .select({
        mime: professionalPhotos.mime,
        data: professionalPhotos.data,
        updatedAt: professionalPhotos.updatedAt,
      })
      .from(professionalPhotos)
      .where(
        and(
          eq(professionalPhotos.tenantId, tenantId),
          eq(professionalPhotos.professionalId, professionalId),
        ),
      )
      .limit(1),
  );
  return row ?? null;
}
