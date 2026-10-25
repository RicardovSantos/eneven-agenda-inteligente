import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db/client";
import type { Db } from "@/db/types";
import { requireCatalogOwner } from "./access";
import { CatalogError } from "./errors";

export type CatalogActionResult = {
  ok: boolean;
  /** Confirmação para o toast ("Serviço salvo"). */
  message?: string;
  /** Erro geral (toast/faixa). */
  error?: string;
  /** Erro por campo. */
  fieldErrors?: Record<string, string>;
  /** Id do item criado/editado. */
  id?: string;
  /** Muda a cada resposta. */
  at: number;
};

const GENERIC_ERROR = "Não foi possível salvar agora. Tente novamente em instantes.";

/** Exige o proprietário, executa e converte erros em resultado para a tela. */
export async function runCatalogAction(
  successMessage: string,
  work: (ctx: { db: Db; tenantId: string }) => Promise<{ id?: string } | void>,
): Promise<CatalogActionResult> {
  try {
    const session = await requireCatalogOwner();
    const db = await getDb();
    const result = await work({ db, tenantId: session.tenantId });
    revalidatePath("/painel", "layout");
    return { ok: true, message: successMessage, id: result?.id, at: Date.now() };
  } catch (error) {
    if (error instanceof CatalogError) {
      return {
        ok: false,
        error: error.message,
        fieldErrors: error.code === "validation" ? error.fieldErrors : undefined,
        at: Date.now(),
      };
    }
    // Redirecionamentos do Next (sessão ausente) precisam seguir adiante.
    unstable_rethrow(error);
    console.error("Falha ao salvar serviços/equipe", error);
    return { ok: false, error: GENERIC_ERROR, at: Date.now() };
  }
}
