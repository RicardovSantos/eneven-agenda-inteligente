"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setPaymentGatewayAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export type GatewayView = { method: string; label: string; current: string; options: { gateway: string; label: string; ready: boolean; reason: string | null }[] };
export type ChangeView = { id: number; at: string; method: string; from: string; to: string };

const NAMES: Record<string, string> = { mercadopago: "Mercado Pago", stripe: "Stripe", card: "Cartão", pix: "Pix", boleto: "Boleto" };
const name = (key: string) => NAMES[key] ?? key;

/** Provedor padrão por forma de pagamento. Só vale para novas contratações; o servidor revalida tudo. */
export function PaymentGatewaysScreen({ settings, changes }: { settings: GatewayView[]; changes: ChangeView[] }) {
  const [saved, setSaved] = useState<Record<string, string>>(() => Object.fromEntries(settings.map((s) => [s.method, s.current])));
  const [draft, setDraft] = useState<Record<string, string>>(saved);
  const [pending, start] = useTransition();
  const toast = useToast();

  function save(method: string) {
    start(async () => {
      const result = await setPaymentGatewayAction({ method, provider: draft[method] });
      if (result.ok) {
        setSaved((prev) => ({ ...prev, [method]: draft[method] }));
        toast.show("Provedor salvo.", "success");
      } else toast.show(result.error, "error");
    });
  }

  return <main className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 pb-10 pt-6 lg:px-8 lg:pt-7">
    <div className="flex flex-col gap-1">
      <Link href="/admin/gerenciar" className="text-sm text-primary">‹ Gerenciar</Link>
      <h1 className="font-display text-[1.75rem] font-semibold">Pagamentos</h1>
      <p className="m-0 text-sm text-ink-muted">Provedor padrão de cada forma de pagamento.</p>
    </div>
    <p role="note" className="m-0 rounded-field bg-primary-soft p-3 text-sm">A alteração vale somente para novas contratações e novas cobranças ainda não iniciadas. Assinaturas e cobranças existentes continuam no provedor original, inclusive nas renovações.</p>
    {settings.map((setting) => {
      const dirty = draft[setting.method] !== saved[setting.method];
      return <section key={setting.method} aria-labelledby={`g-${setting.method}`} className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-5">
        <h2 id={`g-${setting.method}`} className="text-xl font-semibold">{setting.label}</h2>
        <p className="m-0 text-sm text-ink-muted">Padrão atual: <strong>{name(saved[setting.method])}</strong></p>
        <div className="flex flex-col gap-2" role="radiogroup" aria-labelledby={`g-${setting.method}`}>
          {setting.options.map((option) => <label key={option.gateway} className={`flex min-h-11 items-start gap-3 rounded-field border border-line p-3 ${option.ready ? "" : "opacity-60"}`}>
            <input type="radio" name={`gateway-${setting.method}`} value={option.gateway} checked={draft[setting.method] === option.gateway} disabled={!option.ready && saved[setting.method] !== option.gateway}
              onChange={() => setDraft((prev) => ({ ...prev, [setting.method]: option.gateway }))} className="mt-1" />
            <span className="flex flex-col">
              <span className="font-medium">{option.label}</span>
              <span className="text-xs text-ink-muted">{option.ready ? "Credenciais configuradas" : option.reason ?? "Indisponível"}</span>
            </span>
          </label>)}
        </div>
        {setting.options.length === 1 ? <p className="m-0 text-xs text-ink-muted">Só a {setting.options[0].label} faz {setting.label.toLowerCase()} por enquanto.</p> : null}
        <Button type="button" disabled={!dirty || pending} onClick={() => save(setting.method)}>{pending ? "Salvando…" : "Salvar"}</Button>
      </section>;
    })}
    <section aria-labelledby="historico-g" className="flex flex-col gap-2 rounded-panel border border-line bg-surface p-5">
      <h2 id="historico-g" className="text-xl font-semibold">Últimas alterações</h2>
      {changes.length === 0 ? <p className="m-0 text-sm text-ink-muted">Nenhuma alteração ainda.</p> : <ul className="m-0 flex list-none flex-col p-0">{changes.map((c) => <li key={c.id} className="border-t border-line py-2 text-sm first:border-t-0">
        {name(c.method)}: {name(c.from)} → {name(c.to)} <span className="text-ink-muted">· {new Date(c.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
      </li>)}</ul>}
    </section>
  </main>;
}
