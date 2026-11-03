import Link from "next/link";
import { and, eq, isNotNull, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { tenants, whatsappInboundEvents, whatsappMessages, whatsappQueue } from "@/db/schema";
import { requireSuperAdminSession } from "@/server/auth/guard";
import { WhatsAppRecoveryForm } from "@/components/platform/whatsapp-recovery-form";
import { getWhatsAppMetrics } from "@/server/platform/whatsapp-metrics";

function staleThreshold() {
  return new Date(Date.now() - 5 * 60_000);
}

export default async function WhatsAppRecoveryPage() {
  await requireSuperAdminSession();
  const db = await getDb();
  const stale = staleThreshold();
  const usage = await getWhatsAppMetrics(db, new Date());
  const events = await db.select().from(whatsappInboundEvents).where(or(eq(whatsappInboundEvents.state, "uncertain"), and(eq(whatsappInboundEvents.state, "processing"), lte(whatsappInboundEvents.claimedAt, stale)))).orderBy(whatsappInboundEvents.createdAt).limit(100);
  const outgoing = await db.select({ id: whatsappQueue.id, tenantId: whatsappQueue.tenantId, tenantName: tenants.name, templateType: whatsappQueue.templateType, recipientPhone: whatsappMessages.recipientPhone, attemptedAt: whatsappMessages.createdAt })
    .from(whatsappQueue).innerJoin(tenants, eq(tenants.id, whatsappQueue.tenantId))
    .innerJoin(whatsappMessages, and(eq(whatsappMessages.queueId, whatsappQueue.id), eq(whatsappMessages.tenantId, whatsappQueue.tenantId), eq(whatsappMessages.status, "sending")))
    .where(and(isNotNull(whatsappQueue.lockedUntil), isNull(whatsappQueue.processedAt), or(isNotNull(whatsappQueue.errorMessage), lte(whatsappMessages.createdAt, stale))))
    .orderBy(whatsappMessages.createdAt).limit(100);
  return <main className="mx-auto flex w-full max-w-[900px] flex-col gap-5 p-6">
    <Link href="/admin/gerenciar" className="text-primary">‹ Gerenciar</Link>
    <h1 className="text-2xl font-semibold">WhatsApp da plataforma</h1>
    <section aria-labelledby="uso-whatsapp" className="flex flex-col gap-2 rounded-panel border border-line bg-surface p-5">
      <h2 id="uso-whatsapp" className="font-semibold">Uso</h2>
      <p className="m-0">{usage.daily.count} de 250 destinatários nas últimas 24 horas.</p>
      <progress aria-label="Uso do limite diário da Meta" className="w-full" max={250} value={Math.min(usage.daily.count, 250)} />
      <p className={`m-0 ${usage.daily.count > 225 ? "text-danger" : usage.daily.count >= 175 ? "text-amber-700" : "text-green-700"}`}>{usage.daily.count > 225 ? "Limite diário próximo" : usage.daily.count >= 175 ? "Atenção ao limite diário" : "Limite diário disponível"}</p>
      {usage.daily.warnSuperAdmin ? <p className="m-0">70% do limite diário atingido.</p> : null}
      <p className="m-0">{usage.monthlySent} mensagens enviadas no mês · custo estimado {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(usage.estimatedCents / 100)}.</p>
    </section>
    <h2 className="text-xl font-semibold">Ocorrências para revisar</h2>
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
