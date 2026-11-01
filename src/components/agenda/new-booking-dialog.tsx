"use client";

import { Loader2, Search, UserPlus, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { createBookingAction, searchCustomersAction } from "@/app/painel/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatBRL, formatDuration } from "@/lib/format";
import { formatBrazilPhone, normalizeBrazilPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { localDateOf } from "@/server/agenda/time";
import type { CustomerHit } from "@/server/agenda/panel-ops";
import { PanelDialog } from "./panel-dialog";
import { SlotField, type SlotSelection } from "./slot-field";
import { Dot } from "./shared";

export type PanelService = {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
  professionalIds: string[];
};
export type PanelPro = { id: string; name: string; color: string | null; photoUrl?: string | null };

const LABEL = "text-sm font-semibold";

/**
 * Novo agendamento (docs/design/telas/plano-2.md): cliente (busca ou novo),
 * serviços, profissional, dia e horário (só horários livres, ou "encaixar fora
 * dos horários") e observação.
 */
export function NewBookingDialog({
  open,
  onClose,
  today,
  timezone,
  services,
  professionals,
  defaultProfessionalId,
  lockedProfessionalId,
  initialCustomer,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  today: string;
  timezone: string;
  services: PanelService[];
  professionals: PanelPro[];
  /** Profissional do filtro atual (padrão do campo). */
  defaultProfessionalId: string | null;
  /** Profissional que usa o painel (`staff`): campo fixo. */
  lockedProfessionalId: string | null;
  /** Cliente já escolhido ao abrir (ficha do cliente). */
  initialCustomer?: CustomerHit;
  onCreated: (date: string) => void;
}) {
  return (
    <PanelDialog open={open} onClose={onClose} title="Novo agendamento" titleId="new-booking-title">
      <NewBookingForm
        today={today}
        timezone={timezone}
        services={services}
        professionals={professionals}
        defaultProfessionalId={defaultProfessionalId}
        lockedProfessionalId={lockedProfessionalId}
        initialCustomer={initialCustomer}
        onClose={onClose}
        onCreated={onCreated}
      />
    </PanelDialog>
  );
}

function NewBookingForm({
  today,
  timezone,
  services,
  professionals,
  defaultProfessionalId,
  lockedProfessionalId,
  initialCustomer,
  onClose,
  onCreated,
}: Omit<Parameters<typeof NewBookingDialog>[0], "open">) {
  const toast = useToast();
  const [picked, setPicked] = useState<CustomerHit | null>(initialCustomer ?? null);
  const [isNew, setIsNew] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ q: string; hits: CustomerHit[] }>({ q: "", hits: [] });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [professionalId, setProfessionalId] = useState<string>(defaultProfessionalId ?? "any");
  const [slot, setSlot] = useState<SlotSelection | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const q = query.trim();
  useEffect(() => {
    if (q.length < 2) return;
    let alive = true;
    const timer = setTimeout(() => {
      searchCustomersAction(q).then((hits) => {
        if (alive) setFound({ q, hits });
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q]);
  const hits = q.length >= 2 && found.q === q ? found.hits : null;

  // Profissionais que fazem todos os serviços escolhidos.
  const eligible = professionals.filter((p) =>
    serviceIds.every((id) => services.find((s) => s.id === id)?.professionalIds.includes(p.id)),
  );
  const effectivePro = lockedProfessionalId
    ? lockedProfessionalId
    : eligible.some((p) => p.id === professionalId)
      ? professionalId
      : "any";

  const chosen = services.filter((s) => serviceIds.includes(s.id));
  const totalMin = chosen.reduce((sum, s) => sum + s.durationMin, 0);
  const totalCents = chosen.reduce((sum, s) => sum + s.priceCents, 0);

  const customerReady = picked !== null || (name.trim().length >= 2 && normalizeBrazilPhone(phone) !== null);
  const ready = customerReady && serviceIds.length > 0 && slot !== null;

  function toggleService(id: string) {
    setServiceIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
    setSlot(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || !slot || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await createBookingAction({
        serviceIds,
        professionalId: effectivePro,
        startsAt: slot.startsAt,
        name: picked ? picked.name : name,
        phone: picked ? picked.phone : phone,
        notes: notes || undefined,
        allowOutsideHours: slot.outsideHours,
      });
      if (result.ok) {
        toast.show(result.message);
        onCreated(localDateOf(new Date(slot.startsAt), timezone));
        onClose();
      } else {
        setError(result.error);
        setSlot(null);
      }
    } catch {
      setError("Não foi possível agendar agora. Tente novamente em instantes.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-6" noValidate>
      {error ? <FormAlert>{error}</FormAlert> : null}

      <section className="flex flex-col gap-2.5" aria-labelledby="nb-customer">
        <h3 id="nb-customer" className={LABEL}>
          Cliente
        </h3>
        {picked ? (
          <div className="flex items-center justify-between gap-3 rounded-field border border-line bg-canvas px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate font-semibold">{picked.name}</p>
              <p className="text-sm tabular-nums text-ink-muted">{formatBrazilPhone(picked.phone)}</p>
            </div>
            <button
              type="button"
              onClick={() => setPicked(null)}
              aria-label="Trocar cliente"
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-field text-ink-muted hover:bg-primary-soft"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        ) : isNew ? (
          <div className="flex flex-col gap-3 rounded-field border border-line bg-canvas p-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Nome do cliente
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={80} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              WhatsApp
              <Input
                value={phone}
                onChange={(e) => setPhone(formatBrazilPhone(e.target.value))}
                inputMode="tel"
                autoComplete="off"
                placeholder="(11) 99999-9999"
              />
            </label>
            <button
              type="button"
              onClick={() => setIsNew(false)}
              className="min-h-11 self-start cursor-pointer text-sm font-semibold text-primary hover:underline"
            >
              Buscar cliente existente
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome ou WhatsApp"
                aria-label="Buscar cliente por nome ou WhatsApp"
                autoComplete="off"
                className="pl-10"
              />
            </div>
            {hits ? (
              hits.length > 0 ? (
                <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-field border border-line">
                  {hits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        onClick={() => setPicked(hit)}
                        className="flex min-h-12 w-full cursor-pointer flex-col items-start justify-center px-3 py-2 text-left hover:bg-primary-soft"
                      >
                        <span className="font-semibold">{hit.name}</span>
                        <span className="text-sm tabular-nums text-ink-muted">{formatBrazilPhone(hit.phone)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-muted">Nenhum cliente encontrado.</p>
              )
            ) : null}
            <button
              type="button"
              onClick={() => {
                setIsNew(true);
                setName(/\d/.test(q) ? "" : q);
                setPhone(/\d/.test(q) ? formatBrazilPhone(q) : "");
              }}
              className="flex min-h-11 cursor-pointer items-center gap-2 self-start text-sm font-semibold text-primary hover:underline"
            >
              <UserPlus className="size-4" aria-hidden="true" />+ Novo cliente
            </button>
          </>
        )}
      </section>

      <section className="flex flex-col gap-2.5" aria-labelledby="nb-services">
        <h3 id="nb-services" className={LABEL}>
          Serviços
        </h3>
        <div className="flex flex-wrap gap-2">
          {services.map((service) => {
            const on = serviceIds.includes(service.id);
            return (
              <button
                key={service.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleService(service.id)}
                className={cn(
                  "flex min-h-11 cursor-pointer flex-col items-start justify-center rounded-[14px] border px-3.5 py-1.5 text-left",
                  on
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-line bg-surface text-foreground hover:bg-primary-soft/60",
                )}
              >
                <span className="text-[0.9375rem] font-semibold">{service.name}</span>
                <span className={cn("text-xs tabular-nums", on ? "text-primary" : "text-ink-muted")}>
                  {formatDuration(service.durationMin)} · {formatBRL(service.priceCents)}
                </span>
              </button>
            );
          })}
        </div>
        {chosen.length > 0 ? (
          <p className="text-sm tabular-nums text-ink-muted">
            {chosen.length} {chosen.length === 1 ? "serviço" : "serviços"} · {formatDuration(totalMin)} ·{" "}
            {formatBRL(totalCents)}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-2.5" aria-labelledby="nb-pro">
        <h3 id="nb-pro" className={LABEL}>
          Profissional
        </h3>
        {lockedProfessionalId ? (
          <p className="flex min-h-11 items-center gap-2 text-[0.9375rem] font-medium">
            <Dot color={professionals.find((p) => p.id === lockedProfessionalId)?.color ?? null} size={8} />
            {professionals.find((p) => p.id === lockedProfessionalId)?.name}
          </p>
        ) : (
          <Select
            aria-labelledby="nb-pro"
            value={effectivePro}
            onChange={(e) => {
              setProfessionalId(e.target.value);
              setSlot(null);
            }}
          >
            <option value="any">Qualquer profissional</option>
            {eligible.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
      </section>

      <section className="flex flex-col gap-2.5" aria-labelledby="nb-when">
        <h3 id="nb-when" className={LABEL}>
          Dia e horário
        </h3>
        {serviceIds.length === 0 ? (
          <p className="text-[0.9375rem] text-ink-muted">Escolha o serviço para ver os horários livres.</p>
        ) : (
          <SlotField
            key={`${serviceIds.join(",")}|${effectivePro}`}
            today={today}
            timezone={timezone}
            base={{ serviceIds, professionalId: effectivePro }}
            loadKey={`${serviceIds.join(",")}|${effectivePro}`}
            value={slot}
            onChange={setSlot}
          />
        )}
      </section>

      <label className="flex flex-col gap-2.5 text-sm font-semibold">
        Observação (opcional)
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={300}
          rows={3}
          className="font-normal"
        />
      </label>

      <div className="mt-auto flex gap-3 pt-2">
        <Button type="button" variant="outline" size="lg" onClick={onClose} className="flex-1 lg:flex-none lg:px-6">
          Voltar
        </Button>
        <Button type="submit" size="lg" disabled={!ready || pending} className="flex-1">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Agendar
        </Button>
      </div>
    </form>
  );
}
