"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
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

/** Pagamento já confirmado: o que a tela mostra no lugar do QR Code. */
export type ConfirmedCharge = { method: "pix" | "boleto"; paidUntilLabel: string | null };

/** De quanto em quanto tempo a tela pergunta ao servidor se o pagamento caiu. */
const POLL_MS = 3_000;
const POLL_HIDDEN_MS = 20_000;

const field = "min-h-11 w-full rounded-field border border-line bg-canvas px-3 text-base font-normal";
const primaryButton = "flex min-h-12 w-full items-center justify-center rounded-field bg-primary px-5 text-center font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60";
const secondaryButton = "flex min-h-11 w-full items-center justify-center rounded-field border border-line bg-canvas px-4 text-center text-sm font-semibold transition-colors hover:bg-primary-soft disabled:opacity-50";

const STATES = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

/** O que o servidor responde sobre a cobrança (`GET /api/painel/cobranca/status`). */
type StatusResponse = { ok?: boolean; state?: string; method?: "pix" | "boleto"; paidUntilLabel?: string | null };

/** Pagamento confirmado, no mesmo lugar onde estava o QR Code. */
function ConfirmedView({ charge }: { charge: ConfirmedCharge }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 rounded-field bg-[#E8F7EF] p-6 text-center dark:bg-[#12301f]">
      <span className="grid size-14 place-items-center rounded-full bg-[#0B7A44] text-white dark:bg-[#3dd68c] dark:text-[#12301f]" aria-hidden="true">
        <Check className="size-8" strokeWidth={3} />
      </span>
      <p className="m-0 text-xl font-semibold text-[#0B7A44] dark:text-[#3dd68c]">{charge.method === "pix" ? "Pix confirmado!" : "Boleto pago!"}</p>
      <p className="m-0 text-sm text-foreground">
        {charge.paidUntilLabel ? <>Seu plano está pago até <strong>{charge.paidUntilLabel}</strong>.</> : "Seu plano está pago."}
      </p>
    </div>
  );
}

/**
 * Cobrança em aberto: mostra o QR ou o boleto e pergunta ao servidor, a cada 3 s, se o pagamento
 * caiu. Ao cair, avisa quem chamou (que troca o QR pela confirmação, sem recarregar a página).
 * Com a aba escondida pergunta menos, e ao voltar para a aba pergunta na hora.
 */
function OpenChargeView({ charge, onConfirmed }: { charge: OpenCharge; onConfirmed: (confirmed: ConfirmedCharge) => void }) {
  const router = useRouter();
  const { show } = useToast();
  const [offline, setOffline] = useState(false);
  const confirmedRef = useRef(onConfirmed);
  useEffect(() => {
    confirmedRef.current = onConfirmed;
  });

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    function schedule() {
      if (stopped) return;
      clearTimeout(timer);
      timer = setTimeout(() => void check(), document.visibilityState === "visible" ? POLL_MS : POLL_HIDDEN_MS);
    }

    async function check() {
      if (stopped) return;
      try {
        const response = await fetch(`/api/painel/cobranca/status?id=${encodeURIComponent(charge.id)}`, { cache: "no-store", signal: controller.signal });
        if (response.status === 401) {
          // Sessão perdida ou conta trocada: a página decide o que mostrar.
          stopped = true;
          router.refresh();
          return;
        }
        const data = (await response.json()) as StatusResponse;
        if (stopped) return;
        setOffline(false);
        if (data.state === "approved") {
          stopped = true;
          confirmedRef.current({ method: data.method ?? charge.method, paidUntilLabel: data.paidUntilLabel ?? null });
          return;
        }
        if (data.state === "expired" || data.state === "failed" || data.state === "none") {
          stopped = true;
          router.refresh();
          return;
        }
      } catch {
        if (stopped) return;
        setOffline(true);
      }
      schedule();
    }

    function wake() {
      if (stopped || document.visibilityState !== "visible") return;
      clearTimeout(timer);
      void check();
    }

    schedule();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [charge.id, charge.method, router]);

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
        {charge.validity ? ` · ${charge.validity}` : ""}.
      </p>
      <p role="status" aria-live="polite" className="m-0 flex items-center gap-2 rounded-field bg-primary-soft px-3 py-2 text-sm font-medium text-primary">
        <span className={`size-2.5 shrink-0 rounded-full ${offline ? "bg-[#9A3412]" : "animate-pulse bg-primary"}`} aria-hidden="true" />
        {offline ? "Sem conexão agora. Tentando de novo…" : charge.method === "pix" ? "Aguardando o pagamento. Assim que o Pix cair, esta tela confirma sozinha." : "Aguardando o pagamento. Depois de pago, o boleto leva de 1 a 3 dias úteis para compensar e esta tela confirma sozinha."}
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

function maskZip(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

/** Endereço do boleto. O CEP preenche rua, bairro, cidade e estado pelo ViaCEP (gratuito); tudo continua editável. */
function BoletoFields({ errors }: { errors: Record<string, string> }) {
  const [zip, setZip] = useState("");
  const [address, setAddress] = useState({ street: "", neighborhood: "", city: "", state: "" });
  const [lookup, setLookup] = useState<"idle" | "loading" | "notfound" | "failed">("idle");

  async function onZip(value: string) {
    const masked = maskZip(value);
    setZip(masked);
    const digits = masked.replace(/\D/g, "");
    if (digits.length !== 8) {
      setLookup("idle");
      return;
    }
    setLookup("loading");
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw new Error("falha");
      const data = (await response.json()) as { erro?: unknown; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (data.erro) {
        setLookup("notfound");
        return;
      }
      // Só preenche o que o ViaCEP trouxe; CEP geral de cidade vem sem rua e sem bairro.
      setAddress((current) => ({
        street: data.logradouro || current.street,
        neighborhood: data.bairro || current.neighborhood,
        city: data.localidade || current.city,
        state: data.uf && STATES.includes(data.uf) ? data.uf : current.state,
      }));
      setLookup("idle");
    } catch {
      setLookup("failed");
    }
  }

  const input = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <input name={name} required aria-invalid={errors[name] ? true : undefined} className={field} {...props} />
      {errors[name] ? <span className="text-xs font-normal text-danger">{errors[name]}</span> : null}
    </label>
  );
  const bound = (key: keyof typeof address) => ({ value: address[key], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setAddress((current) => ({ ...current, [key]: e.target.value })) });
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">{input("name", "Nome completo", { autoComplete: "name", maxLength: 80 })}</div>
      {input("document", "CPF ou CNPJ", { inputMode: "numeric", maxLength: 18 })}
      <div className="flex flex-col gap-1">
        {input("zipCode", "CEP", { inputMode: "numeric", autoComplete: "postal-code", maxLength: 9, value: zip, onChange: (e) => void onZip(e.target.value) })}
        <span role="status" className="text-xs text-ink-muted">
          {lookup === "loading" ? "Buscando o endereço…" : lookup === "notfound" ? "CEP não encontrado. Preencha o endereço abaixo." : lookup === "failed" ? "Não foi possível buscar o CEP agora. Preencha o endereço abaixo." : "Digite o CEP e o endereço é preenchido."}
        </span>
      </div>
      <div className="sm:col-span-2">{input("street", "Rua", { autoComplete: "address-line1", maxLength: 80, ...bound("street") })}</div>
      {input("number", "Número", { maxLength: 10 })}
      {input("neighborhood", "Bairro", { maxLength: 60, ...bound("neighborhood") })}
      {input("city", "Cidade", { maxLength: 60, ...bound("city") })}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Estado
        <select name="state" required value={address.state} onChange={(e) => setAddress((current) => ({ ...current, state: e.target.value }))} aria-invalid={errors.state ? true : undefined} className={field}>
          <option value="" disabled>Escolha</option>
          {STATES.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
        </select>
        {errors.state ? <span className="text-xs font-normal text-danger">{errors.state}</span> : null}
      </label>
      <p className="m-0 text-xs text-ink-muted sm:col-span-2">A Mercado Pago exige esses dados para emitir o boleto. Eles vão direto para ela e não ficam guardados aqui. A busca do CEP usa o ViaCEP, que só recebe o número do CEP.</p>
    </div>
  );
}

/** Pagamento do mês por Pix ou boleto. */
export function ChargePanel({ open, canCreate, priceLabel, confirmed }: { open: OpenCharge | null; canCreate: boolean; priceLabel: string; /** Pagamento confirmado há pouco (o servidor sabe), mostrado no lugar do formulário. */ confirmed: ConfirmedCharge | null }) {
  const [method, setMethod] = useState<"pix" | "boleto">("pix");
  const [justConfirmed, setJustConfirmed] = useState<ConfirmedCharge | null>(null);
  const [state, action, pending] = useActionState<ChargeFormState, FormData>(startChargeAction, {});
  const { show } = useToast();
  const router = useRouter();
  useEffect(() => {
    if (state.at === undefined) return;
    if (state.error) show(state.error, "error");
    else if (state.ok) router.refresh();
  }, [state, show, router]);

  // A confirmação fica aqui, no lugar do QR Code, e a página ao redor se atualiza em seguida
  // (plano pago, histórico). Se este bloco sumisse junto com a cobrança, a tela voltaria a oferecer "Gerar Pix".
  if (justConfirmed) return <ConfirmedView charge={justConfirmed} />;
  if (open) {
    return (
      <OpenChargeView
        charge={open}
        onConfirmed={(done) => {
          setJustConfirmed(done);
          show(done.method === "pix" ? "Pix confirmado" : "Boleto pago");
          router.refresh();
        }}
      />
    );
  }
  if (confirmed) return <ConfirmedView charge={confirmed} />;
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
