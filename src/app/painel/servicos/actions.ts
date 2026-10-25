"use server";

import { runCatalogAction, type CatalogActionResult } from "@/server/catalog/action";
import {
  CatalogError,
  archiveService,
  restoreService,
  saveService,
  type ServiceInput,
} from "@/server/catalog";

const asObject = (input: unknown) => {
  if (typeof input !== "object" || input === null) {
    throw new CatalogError("validation", "Dados inválidos.");
  }
  return input as Record<string, unknown>;
};

export async function saveServiceAction(input: unknown): Promise<CatalogActionResult> {
  return runCatalogAction("Serviço salvo", async ({ db, tenantId }) => {
    const raw = asObject(input);
    // Só os campos conhecidos; o tenant vem da sessão.
    return saveService(db, tenantId, {
      id: typeof raw.id === "string" ? raw.id : undefined,
      name: raw.name as string,
      description: typeof raw.description === "string" ? raw.description : null,
      durationMin: raw.durationMin as number,
      bufferAfterMin: raw.bufferAfterMin as number,
      priceCents: raw.priceCents as number,
      visible: raw.visible === true,
      professionalIds: raw.professionalIds as string[],
    } satisfies ServiceInput);
  });
}

export async function archiveServiceAction(id: unknown): Promise<CatalogActionResult> {
  return runCatalogAction("Serviço arquivado", async ({ db, tenantId }) => {
    await archiveService(db, tenantId, String(id));
  });
}

export async function restoreServiceAction(id: unknown): Promise<CatalogActionResult> {
  return runCatalogAction("Serviço restaurado", async ({ db, tenantId }) => {
    await restoreService(db, tenantId, String(id));
  });
}
