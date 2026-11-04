"use server";

import { runCatalogAction, type CatalogActionResult } from "@/server/catalog/action";
import {
  CatalogError,
  deactivateProfessional,
  removeProfessional,
  saveProfessional,
  type ProfessionalInput,
} from "@/server/catalog";
import type { WeeklyHours } from "@/lib/weekly-hours";
import { MediaError, removeProfessionalPhoto, saveProfessionalPhoto } from "@/server/media";
import { isUuid } from "@/server/catalog/services";

export async function saveProfessionalAction(input: unknown): Promise<CatalogActionResult> {
  return runCatalogAction("Profissional salvo", async ({ db, tenantId }) => {
    if (typeof input !== "object" || input === null) {
      throw new CatalogError("validation", "Dados inválidos.");
    }
    const raw = input as Record<string, unknown>;
    return saveProfessional(db, tenantId, {
      id: typeof raw.id === "string" ? raw.id : undefined,
      name: raw.name as string,
      title: typeof raw.title === "string" ? raw.title : undefined,
      color: raw.color as string,
      active: raw.active === true,
      serviceIds: raw.serviceIds as string[],
      hours: raw.hours as WeeklyHours,
    } satisfies ProfessionalInput);
  });
}

export async function deactivateProfessionalAction(id: unknown, cancelFuture: unknown = false): Promise<CatalogActionResult> {
  return runCatalogAction("Profissional desativado", async ({ db, tenantId }) => {
    await deactivateProfessional(db, tenantId, String(id), new Date(), { cancelFuture: cancelFuture === true });
  });
}

export async function removeProfessionalAction(id: unknown, cancelFuture: unknown = false): Promise<CatalogActionResult> {
  return runCatalogAction("Profissional removido da equipe", async ({ db, tenantId }) => {
    await removeProfessional(db, tenantId, String(id), new Date(), { cancelFuture: cancelFuture === true });
  });
}

/** Troca a foto de um profissional; qualquer formato vira WebP. */
export async function uploadProfessionalPhotoAction(formData: FormData): Promise<CatalogActionResult> {
  return runCatalogAction("Foto atualizada", async ({ db, tenantId }) => {
    const id = formData.get("id");
    const file = formData.get("photo");
    if (typeof id !== "string" || !isUuid(id)) {
      throw new CatalogError("not_found", "Profissional não encontrado.");
    }
    if (!(file instanceof File) || file.size === 0) {
      throw new CatalogError("validation", "Escolha uma imagem.", { photo: "Escolha uma imagem." });
    }
    try {
      await saveProfessionalPhoto(db, tenantId, id, { bytes: Buffer.from(await file.arrayBuffer()) });
    } catch (error) {
      if (error instanceof MediaError) {
        throw new CatalogError("validation", error.message, { photo: error.message });
      }
      throw error;
    }
    return { id };
  });
}

export async function removeProfessionalPhotoAction(id: unknown): Promise<CatalogActionResult> {
  return runCatalogAction("Foto removida", async ({ db, tenantId }) => {
    if (typeof id !== "string" || !isUuid(id)) {
      throw new CatalogError("not_found", "Profissional não encontrado.");
    }
    await removeProfessionalPhoto(db, tenantId, id);
  });
}
