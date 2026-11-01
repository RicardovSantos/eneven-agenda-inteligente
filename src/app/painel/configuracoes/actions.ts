"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db/client";
import type { Db } from "@/db/types";
import { z } from "zod";
import type { WeeklyHours } from "@/lib/weekly-hours";
import { requireTenantSession } from "@/server/auth/guard";
import { requireOwner } from "@/server/settings/access";
import { TeamError } from "@/server/team/errors";
import {
  inviteMember,
  resendInvitation,
  revokeInvitation,
  type TeamActor,
} from "@/server/team/invitations";
import { removeMember } from "@/server/team/members";
import { MediaError, removeHeroPhoto, saveHeroPhoto } from "@/server/media";
import {
  SettingsError,
  checkSlugAvailability,
  removeLogo,
  updateBookingRules,
  updateBranding,
  updateBusinessHours,
  updateBusinessInfo,
  updateHeroText,
  updateSlug,
  uploadLogo,
  type SlugAvailability,
} from "@/server/settings";

const dayRanges = z.array(z.object({ start: z.string(), end: z.string() }).strict());
const weeklyHoursSchema = z
  .object({
    0: dayRanges,
    1: dayRanges,
    2: dayRanges,
    3: dayRanges,
    4: dayRanges,
    5: dayRanges,
    6: dayRanges,
  })
  .strict();

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
  /** Horário salvo sem aplicar à equipe e algum ativo ficou com expediente diferente. */
  teamOutOfSync?: boolean;
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
    if (error instanceof MediaError) {
      return { fieldErrors: { photo: error.message }, at: Date.now() };
    }
    if (error instanceof SettingsError) {
      return error.code === "forbidden"
        ? { error: error.message, at: Date.now() }
        : { fieldErrors: error.fieldErrors, error: undefined, at: Date.now() };
    }
    // Redirecionamentos do Next (sessão ausente) precisam seguir adiante.
    unstable_rethrow(error);
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
      facebook: text(formData, "facebook"),
      about: text(formData, "about"),
    });
    return {};
  });
}

export async function saveHeroTextAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return run(async ({ db, tenantId }) => {
    await updateHeroText(db, tenantId, {
      heroTitle: text(formData, "heroTitle"),
      heroSubtitle: text(formData, "heroSubtitle"),
    });
    return {};
  });
}

/** Troca a imagem de uma posição do carrossel (0 a 2); qualquer formato vira WebP. */
export async function uploadHeroPhotoAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return run(async ({ db, tenantId }) => {
    const file = formData.get("photo");
    if (!(file instanceof File) || file.size === 0) throw new MediaError("Escolha uma imagem.");
    await saveHeroPhoto(db, tenantId, Number(text(formData, "slot")), {
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return { message: "Imagem atualizada" };
  });
}

export async function removeHeroPhotoAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return run(async ({ db, tenantId }) => {
    await removeHeroPhoto(db, tenantId, Number(text(formData, "slot")));
    return { message: "Imagem removida" };
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
    const invalid = () =>
      new SettingsError("validation", "Horário inválido.", { hours: "Horário inválido." });
    let json: unknown;
    try {
      json = JSON.parse(text(formData, "hours"));
    } catch {
      throw invalid();
    }
    // Forma exata: objeto com os dias 0 a 6, cada um uma lista de { start, end }.
    const parsed = weeklyHoursSchema.safeParse(json);
    if (!parsed.success) throw invalid();
    const { teamOutOfSync } = await updateBusinessHours(db, tenantId, parsed.data as WeeklyHours, {
      applyToTeam: text(formData, "applyToTeam") === "1",
    });
    return { teamOutOfSync };
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
    unstable_rethrow(error);
    return { status: "invalid" };
  }
}

// --- Acessos da equipe (só o proprietário; o token do convite só vai por e-mail) ---

export type TeamActionState = {
  ok?: boolean;
  /** Confirmação para o toast. */
  message?: string;
  /** Erro geral (faixa no diálogo ou toast). */
  error?: string;
  /** Erro por campo, pelo `name` do campo. */
  fieldErrors?: Record<string, string>;
  /** `false`: o convite foi criado, mas o provedor de e-mail falhou. */
  emailSent?: boolean;
  at?: number;
};

const EMAIL_NOT_SENT = "Convite criado, mas o e-mail não foi enviado. Use “Reenviar convite”.";
const TEAM_GENERIC_ERROR = "Não foi possível concluir agora. Tente novamente em instantes.";

/**
 * Ator vindo da sessão (nunca da entrada); a regra "só o proprietário" é do
 * módulo da equipe, que recusa os demais papéis com `forbidden`.
 */
async function runTeam(
  work: (ctx: { db: Db; actor: TeamActor }) => Promise<Partial<TeamActionState>>,
): Promise<TeamActionState> {
  try {
    const session = await requireTenantSession();
    const actor: TeamActor = {
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role ?? "staff",
    };
    const result = await work({ db: await getDb(), actor });
    revalidatePath("/painel/configuracoes");
    revalidatePath("/painel/equipe");
    return { ok: true, ...result, at: Date.now() };
  } catch (error) {
    if (error instanceof TeamError) {
      return error.code === "validation"
        ? { ok: false, fieldErrors: error.fieldErrors, at: Date.now() }
        : { ok: false, error: error.message, at: Date.now() };
    }
    unstable_rethrow(error);
    console.error("Falha nos acessos da equipe", error);
    return { ok: false, error: TEAM_GENERIC_ERROR, at: Date.now() };
  }
}

export async function inviteMemberAction(
  _previous: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  return runTeam(async ({ db, actor }) => {
    const role = text(formData, "role");
    const { emailSent } = await inviteMember(db, actor, {
      name: text(formData, "name"),
      email: text(formData, "email"),
      // Valor fora da lista cai na validação do módulo ("Escolha o tipo de acesso.").
      role: role as "reception" | "staff",
      professionalId: role === "staff" ? text(formData, "professionalId") || undefined : undefined,
    });
    return emailSent
      ? { message: "Convite enviado", emailSent: true }
      : { message: EMAIL_NOT_SENT, emailSent: false };
  });
}

export async function resendInvitationAction(invitationId: string): Promise<TeamActionState> {
  return runTeam(async ({ db, actor }) => {
    const { emailSent } = await resendInvitation(db, actor, String(invitationId));
    return emailSent
      ? { message: "Convite reenviado", emailSent: true }
      : { message: EMAIL_NOT_SENT, emailSent: false };
  });
}

export async function revokeInvitationAction(invitationId: string): Promise<TeamActionState> {
  return runTeam(async ({ db, actor }) => {
    await revokeInvitation(db, actor, String(invitationId));
    return { message: "Convite cancelado" };
  });
}

export async function removeMemberAction(userId: string): Promise<TeamActionState> {
  return runTeam(async ({ db, actor }) => {
    await removeMember(db, actor, String(userId));
    return { message: "Acesso removido" };
  });
}
