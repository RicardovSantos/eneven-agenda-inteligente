"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db/client";
import type { PanelActor } from "@/server/agenda/panel-ops";
import { requireTenantSession } from "@/server/auth/guard";
import { ClientError, createClient, updateClient, updateClientNotes } from "@/server/clients";

/**
 * Ações da tela de clientes. O estabelecimento e o papel vêm sempre da sessão;
 * a regra de quem pode o quê mora em `server/clients`.
 */

export type ClientActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; existingId?: string };

const GENERIC_ERROR = "Não foi possível concluir agora. Tente novamente em instantes.";

async function actorFromSession(): Promise<PanelActor> {
  const session = await requireTenantSession();
  return { tenantId: session.tenantId, userId: session.userId, role: session.role! };
}

function failure(error: unknown, label: string): ClientActionResult {
  if (error instanceof ClientError) {
    const fieldErrors =
      error.code === "phone_taken" ? { phone: error.message } : error.fieldErrors;
    return {
      ok: false,
      error: error.message,
      ...(fieldErrors ? { fieldErrors } : {}),
      ...(error.existingId ? { existingId: error.existingId } : {}),
    };
  }
  // Redirecionamentos do Next (sessão ausente) precisam seguir adiante.
  unstable_rethrow(error);
  console.error(`Falha em ${label}`, error instanceof Error ? error.name : error);
  return { ok: false, error: GENERIC_ERROR };
}

const asObject = (input: unknown): Record<string, unknown> => {
  if (typeof input !== "object" || input === null) {
    throw new ClientError("validation");
  }
  return input as Record<string, unknown>;
};

/** Só os campos conhecidos; o que não é texto vira vazio e cai na validação do servidor. */
function clientInput(input: unknown) {
  const raw = asObject(input);
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  return { name: text(raw.name), phone: text(raw.phone), email: text(raw.email), notes: text(raw.notes) };
}

export async function createClientAction(input: unknown): Promise<ClientActionResult> {
  try {
    const actor = await actorFromSession();
    const { id } = await createClient(await getDb(), actor, clientInput(input));
    revalidatePath("/painel/clientes");
    return { ok: true, message: "Cliente salvo", id };
  } catch (error) {
    return failure(error, "criar cliente");
  }
}

export async function updateClientAction(id: string, input: unknown): Promise<ClientActionResult> {
  try {
    const actor = await actorFromSession();
    await updateClient(await getDb(), actor, String(id), clientInput(input));
    revalidatePath("/painel/clientes");
    return { ok: true, message: "Alterações salvas", id: String(id) };
  } catch (error) {
    return failure(error, "editar cliente");
  }
}

export async function updateClientNotesAction(id: string, notes: string): Promise<ClientActionResult> {
  try {
    const actor = await actorFromSession();
    await updateClientNotes(await getDb(), actor, String(id), typeof notes === "string" ? notes : "");
    revalidatePath("/painel/clientes");
    return { ok: true, message: "Observações salvas", id: String(id) };
  } catch (error) {
    return failure(error, "salvar observações");
  }
}
