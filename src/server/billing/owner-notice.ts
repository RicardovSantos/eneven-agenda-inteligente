import { and, eq, isNotNull } from "drizzle-orm";
import { memberships, tenants, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { appUrl } from "@/server/email/templates";
import { sendEmail } from "@/server/email/send";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Avisa os donos (e-mail confirmado) que o pagamento do plano não foi confirmado.
 * Lança erro se nenhum e-mail puder ser enviado, para o aviso ficar para revisão.
 */
export async function sendOwnerBillingNotice(db: Db, tenantId: string): Promise<void> {
  const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error("Estabelecimento não encontrado.");
  const owners = await db.select({ email: users.email, name: users.name }).from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.role, "owner"), isNotNull(users.emailVerifiedAt)));
  if (!owners.length) throw new Error("Sem destinatário confirmado.");
  const link = `${appUrl()}/painel/configuracoes/assinatura`;
  const name = escapeHtml(tenant.name);
  let sent = 0;
  for (const owner of owners) {
    try {
      await sendEmail({
        to: owner.email,
        subject: `Pagamento pendente: ${tenant.name}`,
        text: `Olá! Não conseguimos confirmar o pagamento da assinatura de ${tenant.name}. Você ainda tem 7 dias para regularizar sem perder o acesso aos agendamentos. Veja o plano e as faturas: ${link}`,
        html: `<p>Olá!</p><p>Não conseguimos confirmar o pagamento da assinatura de <strong>${name}</strong>. Você ainda tem 7 dias para regularizar sem perder o acesso aos agendamentos.</p><p><a href="${link}">Ver plano e faturas</a></p>`,
      });
      sent++;
    } catch {
      // tenta os demais; só falha se nenhum e-mail saiu
    }
  }
  if (!sent) throw new Error("Falha ao enviar o aviso.");
}
