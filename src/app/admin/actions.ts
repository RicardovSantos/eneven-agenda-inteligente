"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import type { Db } from "@/db/types";
import { SESSION_COOKIE } from "@/server/auth/cookie-names";
import { requireSuperAdminSession } from "@/server/auth/guard";
import {
  activateTenant,
  blockTenant,
  cancelTenant,
  changePlan,
  createTenantByAdmin,
  extendTrial,
  type AdminActor,
} from "@/server/platform/actions";
import { PlatformError } from "@/server/platform/errors";
import { sendOwnerAccessInvite } from "@/server/platform/owner-invite";
import { updatePlan, type PlanInput } from "@/server/platform/plans";
import { endSupport, startSupport } from "@/server/platform/support";
import { TeamError } from "@/server/team/errors";

/**
 * Ações da plataforma (`/admin`). Cada uma revalida o super-admin na própria
 * chamada (o guard redireciona quem não for) e monta o `AdminActor` a partir da
 * sessão: nada de identidade vem do cliente.
 */

export type AdminActionResult =
  | { ok: true; message: string; tenantId?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const GENERIC_ERROR = "Não foi possível concluir agora. Tente novamente em instantes.";

type AdminContext = { db: Db; actor: AdminActor; token: string; tenantId: string | null };

async function adminContext(): Promise<AdminContext> {
  // Fora do try/catch das ações: o redirecionamento do guard precisa seguir adiante.
  const session = await requireSuperAdminSession();
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  return { db: await getDb(), actor: { userId: session.userId }, token, tenantId: session.tenantId };
}

function failure(error: unknown, label: string): AdminActionResult {
  if (error instanceof PlatformError) {
    return { ok: false, error: error.message, fieldErrors: error.fieldErrors };
  }
  if (error instanceof TeamError) {
    return { ok: false, error: "Não encontramos o dono deste estabelecimento." };
  }
  console.error(`Falha em ${label}`, error instanceof Error ? error.name : error);
  return { ok: false, error: GENERIC_ERROR };
}

async function run(
  label: string,
  message: string,
  work: (ctx: AdminContext) => Promise<{ tenantId?: string } | void>,
): Promise<AdminActionResult> {
  const ctx = await adminContext();
  try {
    const extra = await work(ctx);
    revalidatePath("/admin", "layout");
    return {
      ok: true,
      message,
      ...(extra && extra.tenantId ? { tenantId: extra.tenantId } : {}),
    };
  } catch (error) {
    return failure(error, label);
  }
}

export async function createTenantAction(input: unknown): Promise<AdminActionResult> {
  return run("criar estabelecimento", "Estabelecimento criado", async ({ db, actor }) => {
    const raw = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
    const created = await createTenantByAdmin(db, actor, {
      businessName: raw.businessName as string,
      ownerName: raw.ownerName as string,
      ownerEmail: raw.ownerEmail as string,
      whatsapp: raw.whatsapp as string,
      planId: raw.planId as string,
      trialDays: raw.trialDays as number,
    });
    return { tenantId: created.tenantId };
  });
}

export async function changePlanAction(tenantId: string, planId: string): Promise<AdminActionResult> {
  return run("trocar plano", "Plano alterado", ({ db, actor }) =>
    changePlan(db, actor, String(tenantId), String(planId)),
  );
}

export async function extendTrialAction(tenantId: string, days: 7 | 14 | 30): Promise<AdminActionResult> {
  return run(
    "estender teste",
    `Teste estendido em ${Number(days)} dias`,
    ({ db, actor }) => extendTrial(db, actor, String(tenantId), days),
  );
}

export async function activateTenantAction(tenantId: string): Promise<AdminActionResult> {
  return run("ativar assinatura", "Assinatura ativada", ({ db, actor }) =>
    activateTenant(db, actor, String(tenantId)),
  );
}

export async function blockTenantAction(tenantId: string): Promise<AdminActionResult> {
  return run("bloquear estabelecimento", "Estabelecimento bloqueado", ({ db, actor }) =>
    blockTenant(db, actor, String(tenantId)),
  );
}

export async function cancelTenantAction(tenantId: string): Promise<AdminActionResult> {
  return run("cancelar conta", "Conta cancelada", ({ db, actor }) =>
    cancelTenant(db, actor, String(tenantId)),
  );
}

export async function updatePlanAction(planId: string, input: unknown): Promise<AdminActionResult> {
  return run("salvar plano", "Plano salvo", ({ db, actor }) =>
    updatePlan(db, actor, String(planId), (typeof input === "object" && input !== null ? input : {}) as PlanInput),
  );
}

/** Envia ao dono o convite para criar a senha (o e-mail sai pelo servidor; o token nunca passa por aqui). */
export async function sendOwnerInviteAction(tenantId: string): Promise<AdminActionResult> {
  const ctx = await adminContext();
  try {
    const { emailSent } = await sendOwnerAccessInvite(ctx.db, ctx.actor, String(tenantId));
    revalidatePath("/admin", "layout");
    if (!emailSent) {
      return { ok: false, error: "O convite foi criado, mas o e-mail não pôde ser enviado agora." };
    }
    return { ok: true, message: "Acesso enviado por e-mail" };
  } catch (error) {
    return failure(error, "enviar acesso ao dono");
  }
}

/** "Entrar como o estabelecimento": inicia o suporte na própria sessão e abre o painel dele. */
export async function enterSupportAction(tenantId: string): Promise<AdminActionResult> {
  const ctx = await adminContext();
  try {
    await startSupport(ctx.db, ctx.token, ctx.actor, String(tenantId));
  } catch (error) {
    return failure(error, "entrar como o estabelecimento");
  }
  redirect("/painel");
}

/** "Voltar à plataforma" (faixa do painel): encerra o suporte e volta à ficha do estabelecimento. */
export async function leaveSupportAction(): Promise<AdminActionResult> {
  const ctx = await adminContext();
  try {
    await endSupport(ctx.db, ctx.token, ctx.actor);
  } catch (error) {
    // Já fora do suporte (saiu em outra aba, por exemplo, e esta tela ficou velha): o destino
    // é o mesmo, então segue para a plataforma em vez de mostrar erro.
    if (error instanceof PlatformError && error.code === "invalid_state") redirect("/admin");
    return failure(error, "voltar à plataforma");
  }
  redirect(ctx.tenantId ? `/admin/estabelecimentos/${ctx.tenantId}` : "/admin");
}
