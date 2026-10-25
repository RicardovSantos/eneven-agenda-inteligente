"use server";

import { runCatalogAction, type CatalogActionResult } from "@/server/catalog/action";
import {
  CatalogError,
  deactivateProfessional,
  saveProfessional,
  type ProfessionalInput,
} from "@/server/catalog";
import type { WeeklyHours } from "@/lib/weekly-hours";

export async function saveProfessionalAction(input: unknown): Promise<CatalogActionResult> {
  return runCatalogAction("Profissional salvo", async ({ db, tenantId }) => {
    if (typeof input !== "object" || input === null) {
      throw new CatalogError("validation", "Dados inválidos.");
    }
    const raw = input as Record<string, unknown>;
    return saveProfessional(db, tenantId, {
      id: typeof raw.id === "string" ? raw.id : undefined,
      name: raw.name as string,
      color: raw.color as string,
      active: raw.active === true,
      serviceIds: raw.serviceIds as string[],
      hours: raw.hours as WeeklyHours,
    } satisfies ProfessionalInput);
  });
}

export async function deactivateProfessionalAction(id: unknown): Promise<CatalogActionResult> {
  return runCatalogAction("Profissional desativado", async ({ db, tenantId }) => {
    await deactivateProfessional(db, tenantId, String(id));
  });
}
