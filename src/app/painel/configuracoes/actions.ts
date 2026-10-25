"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import type { Db } from "@/db/types";
import type { WeeklyHours } from "@/lib/weekly-hours";
import { requireOwner } from "@/server/settings/access";
import {
  SettingsError,
  checkSlugAvailability,
  removeLogo,
  updateBookingRules,
  updateBranding,
  updateBusinessHours,
  updateBusinessInfo,
  updateSlug,
  uploadLogo,
  type SlugAvailability,
} from "@/server/settings";

export type SettingsFormState = {
  /** Confirmação para o toast ("Alterações salvas"). */
  message?: string;
  /** Erro geral (faixa no cartão). */
  error?: string;
  /** Erro por campo, pelo `name` do campo. */
  fieldErrors?: Record<string, string>;
  /** Muda a cada resposta, para o toast disparar de novo com a mesma mensagem. */
  at?: number;
  /** Cor guardada (já ajustada) e se foi ajustada. */
  color?: string;
  adjusted?: boolean;
  /** Novo link público guardado. */
  slug?: string;
};

const GENERIC_ERROR = "Não foi possível salvar agora. Tente novamente em instantes.";
const SAVED = "Alterações salvas";

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

/** Exige o proprietário, executa e converte erros em estado de formulário. */
async function run(
  work: (ctx: { db: Db; tenantId: string }) => Promise<Partial<SettingsFormState>>,
): Promise<SettingsFormState> {
  try {
    const session = await requireOwner();
    const db = await getDb();
    const result = await work({ db, tenantId: session.tenantId });
    revalidatePath("/painel", "layout");
    return { message: SAVED, ...result, at: Date.now() };
  } catch (error) {
    if (error instanceof SettingsError) {
      return error.code === "forbidden"
        ? { error: error.message, at: Date.now() }
        : { fieldErrors: error.fieldErrors, error: undefined, at: Date.now() };
    }
    // Redirecionamentos do Next (sessão ausente) precisam seguir adiante.
    if (error instanceof Error && error.message.startsWith("NEXT_")) throw error;
    console.error("Falha ao salvar configurações", error);
    return { error: GENERIC_ERROR, at: Date.now() };
  }
}

export async function saveBusinessInfoAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return run(async ({ db, tenantId }) => {
    await updateBusinessInfo(db, tenantId, {
      name: text(formData, "name"),
      whatsapp: text(formData, "whatsapp"),
      address: text(formData, "address"),
      instagram: text(formData, "instagram"),
      about: text(formData, "about"),
    });
    return {};
  });
}

export async function saveBrandColorAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return run(async ({ db, tenantId }) => {
    const result = await updateBranding(db, tenantId, { color: text(formData, "color") });
    return { color: result.color, adjusted: result.adjusted };
  });
}

export async function uploadLogoAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return run(async ({ db, tenantId }) => {
    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) {
      throw new SettingsError("validation", "Escolha uma imagem.", {
        logo: "Escolha uma imagem.",
      });
    }
    await uploadLogo(db, tenantId, {
      mime: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return { message: "Logo atualizado" };
  });
}

export async function removeLogoAction(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- assinatura de useActionState
  _previous: SettingsFormState,
): Promise<SettingsFormState> {
  return run(async ({ db, tenantId }) => {
    await removeLogo(db, tenantId);
    return { message: "Logo removido" };
  });
}

export async function saveHoursAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return run(async ({ db, tenantId }) => {
    let hours: WeeklyHours;
    try {
      hours = JSON.parse(text(formData, "hours")) as WeeklyHours;
    } catch {
      throw new SettingsError("validation", "Horário inválido.", { hours: "Horário inválido." });
    }
    await updateBusinessHours(db, tenantId, hours);
    return {};
  });
}

export async function saveBookingRulesAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return run(async ({ db, tenantId }) => {
    await updateBookingRules(db, tenantId, {
      slotIntervalMin: Number(text(formData, "slotIntervalMin")),
      minNoticeMin: Number(text(formData, "minNoticeMin")),
      maxDaysAhead: Number(text(formData, "maxDaysAhead")),
      cancelWindowMin: Number(text(formData, "cancelWindowMin")),
    });
    return {};
  });
}

export async function saveSlugAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return run(async ({ db, tenantId }) => {
    const { slug } = await updateSlug(db, tenantId, text(formData, "slug"));
    return { slug, message: "Link atualizado" };
  });
}

/** Verificação de disponibilidade do link enquanto o proprietário digita. */
export async function checkSlugAction(raw: string): Promise<SlugAvailability> {
  try {
    const session = await requireOwner();
    return await checkSlugAvailability(await getDb(), session.tenantId, String(raw));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("NEXT_")) throw error;
    return { status: "invalid" };
  }
}
