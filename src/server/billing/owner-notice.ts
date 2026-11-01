import { and, eq, isNotNull } from "drizzle-orm";
import { memberships, tenants, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { appUrl } from "@/server/email/templates";
import { sendEmail } from "@/server/email/send";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

type OwnerMessage = { subject: string; text: string; html: string };

/**
 * Envia a mensagem aos donos do estabelecimento (e-mail confirmado), cada um por
 * vez. Lança erro se nenhum e-mail puder ser enviado, para o aviso ficar para revisão.
 */
async function sendToOwners(
  db: Db,
  tenantId: string,
  build: (ctx: { name: string; safeName: string; link: string; timezone: string }) => OwnerMessage,
): Promise<void> {
  const [tenant] = await db.select({ name: tenants.name, timezone: tenants.timezone }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error("Estabelecimento não encontrado.");
  const owners = await db.select({ email: users.email }).from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.role, "owner"), isNotNull(users.emailVerifiedAt)));
  if (!owners.length) throw new Error("Sem destinatário confirmado.");
  const message = build({ name: tenant.name, safeName: escapeHtml(tenant.name), link: `${appUrl()}/painel/configuracoes/assinatura`, timezone: tenant.timezone });
  let sent = 0;
  for (const owner of owners) {
    try {
      await sendEmail({ to: owner.email, subject: message.subject, text: message.text, html: message.html });
      sent++;
    } catch {
      // tenta os demais; só falha se nenhum e-mail saiu
    }
  }
  if (!sent) throw new Error("Falha ao enviar o aviso.");
}

/** Pagamento não confirmado: ainda há 7 dias de carência. */
export function sendOwnerBillingNotice(db: Db, tenantId: string): Promise<void> {
  return sendToOwners(db, tenantId, ({ name, safeName, link }) => ({
    subject: `Pagamento pendente: ${name}`,
    text: `Olá! Não conseguimos confirmar o pagamento da assinatura de ${name}. Você ainda tem 7 dias para regularizar sem perder o acesso aos agendamentos. Veja o plano e as faturas: ${link}`,
    html: `<p>Olá!</p><p>Não conseguimos confirmar o pagamento da assinatura de <strong>${safeName}</strong>. Você ainda tem 7 dias para regularizar sem perder o acesso aos agendamentos.</p><p><a href="${link}">Ver plano e faturas</a></p>`,
  }));
}

/** Fim do teste grátis: `ending` (faltam poucos dias) ou `ended` (já acabou). */
export function sendTrialNotice(db: Db, tenantId: string, kind: "ending" | "ended", trialEndsAt: Date): Promise<void> {
  return sendToOwners(db, tenantId, ({ name, safeName, link, timezone }) => {
    const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: timezone }).format(trialEndsAt);
    if (kind === "ending") {
      return {
        subject: `Seu teste grátis termina em ${date}: ${name}`,
        text: `Olá! O teste grátis de ${name} termina em ${date}. Para continuar recebendo agendamentos pela sua página, escolha o plano e assine: ${link} Seus dados ficam guardados.`,
        html: `<p>Olá!</p><p>O teste grátis de <strong>${safeName}</strong> termina em <strong>${date}</strong>. Para continuar recebendo agendamentos pela sua página, escolha o plano e assine.</p><p><a href="${link}">Escolher o plano</a></p><p>Seus dados ficam guardados.</p>`,
      };
    }
    return {
      subject: `Seu teste grátis terminou: ${name}`,
      text: `Olá! O teste grátis de ${name} terminou e a sua página de agendamento está pausada. Assine para reativar na hora: ${link} Seus dados continuam guardados.`,
      html: `<p>Olá!</p><p>O teste grátis de <strong>${safeName}</strong> terminou e a sua página de agendamento está pausada.</p><p><a href="${link}">Assinar e reativar na hora</a></p><p>Seus dados continuam guardados.</p>`,
    };
  });
}
