"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { startChargeAction, type ChargeFormState } from "@/app/painel/configuracoes/assinatura/actions";
import { useToast } from "@/components/ui/toast";

export type OpenCharge = {
  id: string;
  method: "pix" | "boleto";
  amountLabel: string;
  qrCode: string | null;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  barcode: string | null;
  /** Texto já formatado ("até 11/11/2030"). */
  validity: string | null;
};

const field = "min-h-11 w-full rounded-field border border-line bg-canvas px-3 text-base font-normal";
const primaryButton = "flex min-h-12 w-full items-center justify-center rounded-field bg-primary px-5 text-center font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60";
const secondaryButton = "flex min-h-11 w-full items-center justify-center rounded-field border border-line bg-canvas px-4 text-center text-sm font-semibold transition-colors hover:bg-primary-soft disabled:opacity-50";

const STATES = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

/** Cobrança em aberto: mostra o QR ou o boleto e se atualiza sozinha quando o pagamento é confirmado. */
function OpenChargeView({ charge }: { charge: OpenCharge }) {
  const router = useRouter();
  const { show } = useToast();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(timer);
  }, [router]);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      show(`${label} copiado`);
    } catch {
      show("Não foi possível copiar. Selecione e copie o texto.", "error");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-ink-muted">
        {charge.method === "pix" ? "Pague este Pix no app do seu banco" : "Seu boleto está pronto"} · <strong className="text-foreground">{charge.amountLabel}</strong>
        {charge.validity ? ` · ${charge.validity}` : ""}. Assim que o pagamento for confirmado, esta tela se atualiza e o mês é liberado.
      </p>
      {charge.method === "pix" ? (
        <>
          {charge.qrCodeBase64 ? (
            // QR vindo da Mercado Pago em base64; não passa por otimização de imagem.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`data:image/png;base64,${charge.qrCodeBase64}`} alt="QR code do Pix" width={220} height={220} className="mx-auto size-[220px] rounded-field bg-white p-2" />
          ) : null}
          {charge.qrCode ? (
            <>
              <p className="m-0 break-all rounded-field bg-canvas p-3 text-xs text-ink-muted" aria-label="Pix copia e cola">{charge.qrCode}</p>
              <button type="button" onClick={() => copy(charge.qrCode!, "Pix copia e cola")} className={secondaryButton}>Copiar Pix copia e cola</button>
            </>
          ) : null}
        </>
      ) : (
        <>
          {charge.ticketUrl ? <a href={charge.ticketUrl} target="_blank" rel="noopener noreferrer" className={primaryButton}>Abrir o boleto</a> : null}
          {charge.barcode ? (
            <>
              <p className="m-0 break-all rounded-field bg-canvas p-3 text-xs text-ink-muted" aria-label="Linha digitável">{charge.barcode}</p>
              <button type="button" onClick={() => copy(charge.barcode!, "Linha digitável")} className={secondaryButton}>Copiar linha digitável</button>
            </>
          ) : null}
          <p className="m-0 text-xs text-ink-muted">O boleto leva de 1 a 3 dias úteis para compensar depois de pago.</p>
        </>
      )}
    </div>
  );
}

function BoletoFields({ errors }: { errors: Record<string, string> }) {
  const input = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <input name={name} required aria-invalid={errors[name] ? true : undefined} className={field} {...props} />
      {errors[name] ? <span className="text-xs font-normal text-danger">{errors[name]}</span> : null}
    </label>
  );
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">{input("name", "Nome completo", { autoComplete: "name", maxLength: 80 })}</div>
      {input("document", "CPF ou CNPJ", { inputMode: "numeric", maxLength: 18 })}
      {input("zipCode", "CEP", { inputMode: "numeric", autoComplete: "postal-code", maxLength: 9 })}
      <div className="sm:col-span-2">{input("street", "Rua", { autoComplete: "address-line1", maxLength: 80 })}</div>
      {input("number", "Número", { maxLength: 10 })}
      {input("neighborhood", "Bairro", { maxLength: 60 })}
      {input("city", "Cidade", { maxLength: 60 })}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Estado
        <select name="state" required defaultValue="" aria-invalid={errors.state ? true : undefined} className={field}>
          <option value="" disabled>Escolha</option>
          {STATES.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
        </select>
        {errors.state ? <span className="text-xs font-normal text-danger">{errors.state}</span> : null}
      </label>
      <p className="m-0 text-xs text-ink-muted sm:col-span-2">A Mercado Pago exige esses dados para emitir o boleto. Eles vão direto para ela e não ficam guardados aqui.</p>
    </div>
  );
}

/** Pagamento do mês por Pix ou boleto. */
export function ChargePanel({ open, canCreate, priceLabel }: { open: OpenCharge | null; canCreate: boolean; priceLabel: string }) {
  const [method, setMethod] = useState<"pix" | "boleto">("pix");
  const [state, action, pending] = useActionState<ChargeFormState, FormData>(startChargeAction, {});
  const { show } = useToast();
  const router = useRouter();
  useEffect(() => {
    if (state.at === undefined) return;
    if (state.error) show(state.error, "error");
    else if (state.ok) router.refresh();
  }, [state, show, router]);

  if (open) return <OpenChargeView charge={open} />;
  if (!canCreate) return null;
  return (
    <form action={action} className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Forma de pagamento" className="grid grid-cols-2 gap-2">
        {(["pix", "boleto"] as const).map((option) => (
          <label key={option} className={`flex min-h-12 cursor-pointer items-center justify-center rounded-field border px-3 text-center font-semibold ${method === option ? "border-primary bg-primary-soft text-primary" : "border-line bg-canvas"}`}>
            <input type="radio" name="method" value={option} checked={method === option} onChange={() => setMethod(option)} className="sr-only" />
            {option === "pix" ? "Pix" : "Boleto"}
          </label>
        ))}
      </div>
      {method === "boleto" ? <BoletoFields errors={state.fieldErrors ?? {}} /> : null}
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Gerando…" : `Gerar ${method === "pix" ? "Pix" : "boleto"} de ${priceLabel}`}
      </button>
      <p className="m-0 text-sm text-ink-muted">Paga um mês de cada vez, sem cobrança automática. Cinco a dez dias antes de vencer avisamos você por e-mail para gerar o próximo.</p>
    </form>
  );
}
