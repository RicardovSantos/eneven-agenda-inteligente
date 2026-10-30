import Link from "next/link";
import { and, eq, isNotNull, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { tenants, whatsappInboundEvents, whatsappMessages, whatsappQueue } from "@/db/schema";
import { requireSuperAdminSession } from "@/server/auth/guard";
import { WhatsAppRecoveryForm } from "@/components/platform/whatsapp-recovery-form";

function staleThreshold() {
  return new Date(Date.now() - 5 * 60_000);
}

export default async function WhatsAppRecoveryPage() {
  await requireSuperAdminSession();
  const db = await getDb();
  const stale = staleThreshold();
  const events = await db.select().from(whatsappInboundEvents).where(or(eq(whatsappInboundEvents.state, "uncertain"), and(eq(whatsappInboundEvents.state, "processing"), lte(whatsappInboundEvents.claimedAt, stale)))).orderBy(whatsappInboundEvents.createdAt).limit(100);
  const outgoing = await db.select({ id: whatsappQueue.id, tenantId: whatsappQueue.tenantId, tenantName: tenants.name, templateType: whatsappQueue.templateType, recipientPhone: whatsappMessages.recipientPhone, attemptedAt: whatsappMessages.createdAt })
    .from(whatsappQueue).innerJoin(tenants, eq(tenants.id, whatsappQueue.tenantId))
    .innerJoin(whatsappMessages, and(eq(whatsappMessages.queueId, whatsappQueue.id), eq(whatsappMessages.tenantId, whatsappQueue.tenantId), eq(whatsappMessages.status, "sending")))
    .where(and(isNotNull(whatsappQueue.lockedUntil), isNull(whatsappQueue.processedAt), or(isNotNull(whatsappQueue.errorMessage), lte(whatsappMessages.createdAt, stale))))
    .orderBy(whatsappMessages.createdAt).limit(100);
  return <main className="mx-auto flex w-full max-w-[900px] flex-col gap-5 p-6">
    <Link href="/admin" className="text-primary">‹ Plataforma</Link>
    <h1 className="text-2xl font-semibold">Revisar eventos WhatsApp</h1>
    <p>Confira na Meta se a resposta foi enviada antes de tentar novamente. Se já foi tratada, marque como concluída.</p>
    {events.length === 0 && outgoing.length === 0 ? <p>Nenhuma ocorrência para revisar.</p> : null}
    {outgoing.map((event) => <section key={event.id} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <p>Envio para {event.tenantName} · {event.templateType}</p>
      <p className="text-sm">Destinatário: {event.recipientPhone} · Tentativa: {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(event.attemptedAt)} (horário de Brasília)</p>
      <p className="break-all text-sm">Ocorrência: {event.id}</p>
      <WhatsAppRecoveryForm id={event.id} tenantId={event.tenantId} canRetry />
    </section>)}
    {events.map((event) => <section key={event.id} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <p className="break-all text-sm">Evento: {event.id}</p>
      <p className="text-sm">Situação: {event.state === "uncertain" ? "Resultado incerto" : "Processamento interrompido"} · Tentativas: {event.attempts}</p>
      <WhatsAppRecoveryForm id={event.id} canRetry={Boolean(event.payloadEncrypted)} />
    </section>)}
  </main>;
}
