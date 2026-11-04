import Link from "next/link";
import { and, eq, inArray, lte, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { billingCharges, billingNotices, billingSubscriptions, tenants } from "@/db/schema";
import { formatBRL } from "@/lib/format";
import { requireSuperAdminSession } from "@/server/auth/guard";
import { liveBillingEnabled } from "@/server/billing/mode";
import { BillingRecoveryForm } from "@/components/platform/billing-recovery-form";
import { releaseChargeAction, reviewNoticeAction } from "./actions";

function staleThreshold() { return new Date(Date.now() - 5 * 60_000); }

export default async function BillingRecoveryPage() {
  await requireSuperAdminSession();
  if (process.env.NODE_ENV === "production" && !liveBillingEnabled()) notFound();
  const db = await getDb();
  const rows = await db.select({ id: billingSubscriptions.id, tenantName: tenants.name, price: billingSubscriptions.priceCents, status: billingSubscriptions.providerStatus, createdAt: billingSubscriptions.createdAt })
    .from(billingSubscriptions).innerJoin(tenants, eq(tenants.id, billingSubscriptions.tenantId))
    .where(or(eq(billingSubscriptions.providerStatus, "uncertain"), and(eq(billingSubscriptions.providerStatus, "creating"), lte(billingSubscriptions.createdAt, staleThreshold()))))
    .orderBy(billingSubscriptions.createdAt).limit(100);
  const notices = await db.select({ id: billingNotices.id, tenantName: tenants.name, state: billingNotices.state, createdAt: billingNotices.createdAt })
    .from(billingNotices).innerJoin(tenants, eq(tenants.id, billingNotices.tenantId))
    .where(or(eq(billingNotices.state, "uncertain"), and(eq(billingNotices.state, "sending"), lte(billingNotices.createdAt, staleThreshold()))))
    .orderBy(billingNotices.createdAt).limit(100);
  const chargeRows = await db.select({ id: billingCharges.id, tenantName: tenants.name, method: billingCharges.method, status: billingCharges.status, amount: billingCharges.amountCents, paymentId: billingCharges.providerPaymentId, createdAt: billingCharges.createdAt })
    .from(billingCharges).innerJoin(tenants, eq(tenants.id, billingCharges.tenantId))
    .where(or(inArray(billingCharges.status, ["uncertain", "refunded", "charged_back"]), and(eq(billingCharges.status, "creating"), lte(billingCharges.createdAt, staleThreshold()))))
    .orderBy(billingCharges.createdAt).limit(100);
  const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
  return <main className="mx-auto flex w-full max-w-[900px] flex-col gap-5 p-6">
    <Link href="/admin/gerenciar" className="text-primary">‹ Gerenciar</Link>
    <h1 className="text-2xl font-semibold">Revisar assinaturas de teste</h1>
    <p>Localize no Mercado Pago a assinatura pendente com a referência abaixo e informe o ID dela. Só confirme ausência depois de conferir no provedor; uma busca sem resultado não libera outra tentativa automaticamente.</p>
    {rows.length === 0 ? <p>Nenhuma ocorrência para revisar.</p> : null}
    {rows.map((row) => <section key={row.id} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <p>{row.tenantName} · {row.price === null ? "Valor indisponível" : formatBRL(row.price)} · {date.format(row.createdAt)}</p>
      <p className="break-all text-sm">Referência: {row.id} · {row.status === "uncertain" ? "Resultado incerto" : "Processamento interrompido"}</p>
      {row.price !== null ? <BillingRecoveryForm subscriptionId={row.id} /> : null}
    </section>)}
    <h2 className="mt-4 text-xl font-semibold">Pix e boleto para revisar</h2>
    <p>Reembolsos e contestações não mudam o acesso sozinhos. Para uma cobrança incerta, confira no painel da Mercado Pago (pelo ID do pagamento, ou pela referência charge:código) se algo foi gerado; só libere se nada existir.</p>
    {chargeRows.length === 0 ? <p>Nenhuma cobrança para revisar.</p> : null}
    {chargeRows.map((row) => <section key={row.id} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <p>{row.tenantName} · {row.method === "pix" ? "Pix" : "Boleto"} · {formatBRL(row.amount)} · {date.format(row.createdAt)}</p>
      <p className="break-all text-sm">Referência: charge:{row.id} · {row.paymentId ? `Pagamento ${row.paymentId} · ` : ""}{row.status === "uncertain" || row.status === "creating" ? "Resultado incerto" : row.status === "refunded" ? "Reembolsado" : "Contestado"}</p>
      {row.status === "uncertain" || row.status === "creating" ? <form action={releaseChargeAction}><input type="hidden" name="chargeId" value={row.id} /><button type="submit" className="rounded-field border border-line px-4 py-2">Nada foi cobrado: liberar nova tentativa</button></form> : null}
    </section>)}
    <h2 className="mt-4 text-xl font-semibold">Avisos de teste</h2>
    <p>Confira no provedor de e-mail se o aviso foi entregue antes de confirmar. Uma nova tentativa pode gerar mensagem duplicada.</p>
    {notices.length === 0 && <p>Nenhum aviso para revisar.</p>}
    {notices.map((notice) => <section key={notice.id} className="space-y-3 rounded-card border border-line bg-surface p-4">
      <p>{notice.tenantName} · {date.format(notice.createdAt)} · {notice.state === "uncertain" ? "Resultado incerto" : "Processamento interrompido"}</p>
      <form action={reviewNoticeAction} className="flex flex-wrap gap-3"><input type="hidden" name="noticeId" value={notice.id} /><button type="submit" name="decision" value="confirmed" className="rounded-field border border-line px-4 py-2">Confirmar envio</button><button type="submit" name="decision" value="retry" className="rounded-field border border-line px-4 py-2">Liberar nova tentativa</button></form>
    </section>)}
  </main>;
}
