"use client";

import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { createBlockAction } from "@/app/painel/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { zonedInstant } from "@/server/agenda/time";
import { PanelDialog } from "./panel-dialog";
import type { PanelPro } from "./new-booking-dialog";

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Bloquear horário (folga, almoço, férias): profissional ou estabelecimento todo, de/até e motivo. */
export function BlockDialog({
  open,
  onClose,
  date,
  timezone,
  professionals,
  lockedProfessionalId,
  defaultProfessionalId,
}: {
  open: boolean;
  onClose: () => void;
  /** Dia selecionado na agenda ("yyyy-MM-dd"). */
  date: string;
  timezone: string;
  professionals: PanelPro[];
  lockedProfessionalId: string | null;
  defaultProfessionalId: string | null;
}) {
  return (
    <PanelDialog open={open} onClose={onClose} title="Bloquear horário" titleId="block-title">
      <BlockForm
        date={date}
        timezone={timezone}
        professionals={professionals}
        lockedProfessionalId={lockedProfessionalId}
        defaultProfessionalId={defaultProfessionalId}
        onClose={onClose}
      />
    </PanelDialog>
  );
}

function BlockForm({
  date,
  timezone,
  professionals,
  lockedProfessionalId,
  defaultProfessionalId,
  onClose,
}: Omit<Parameters<typeof BlockDialog>[0], "open">) {
  const toast = useToast();
  const [professionalId, setProfessionalId] = useState(lockedProfessionalId ?? defaultProfessionalId ?? "all");
  const [fromDate, setFromDate] = useState(date);
  const [fromTime, setFromTime] = useState("12:00");
  const [toDate, setToDate] = useState(date);
  const [toTime, setToTime] = useState("13:00");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const complete = fromDate && fromTime && toDate && toTime;
  const startsAt = complete ? zonedInstant(fromDate, toMinutes(fromTime), timezone) : null;
  const endsAt = complete ? zonedInstant(toDate, toMinutes(toTime), timezone) : null;
  const valid = startsAt !== null && endsAt !== null && endsAt.getTime() > startsAt.getTime();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!startsAt || !endsAt || pending) return;
    if (!valid) {
      setError("O fim precisa ser depois do início.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await createBlockAction({
        professionalId: lockedProfessionalId ?? professionalId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        reason: reason || undefined,
      });
      if (result.ok) {
        toast.show(result.message);
        onClose();
      } else {
        setError(result.error);
      }
    } catch {
      setError("Não foi possível bloquear agora. Tente novamente em instantes.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-5" noValidate>
      {error ? <FormAlert>{error}</FormAlert> : null}

      {lockedProfessionalId ? null : (
        <label className="flex flex-col gap-2 text-sm font-semibold">
          Profissional
          <Select value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
            <option value="all">Todo o estabelecimento</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">De</legend>
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <Input type="date" aria-label="De, dia" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <Input type="time" aria-label="De, hora" value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">Até</legend>
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <Input type="date" aria-label="Até, dia" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <Input type="time" aria-label="Até, hora" value={toTime} onChange={(e) => setToTime(e.target.value)} />
        </div>
      </fieldset>

      <label className="flex flex-col gap-2 text-sm font-semibold">
        Motivo (opcional)
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={120}
          placeholder="Almoço, folga, férias…"
          className="font-normal"
        />
      </label>

      <div className="mt-auto flex gap-3 pt-2">
        <Button type="button" variant="outline" size="lg" onClick={onClose} className="flex-1 lg:flex-none lg:px-6">
          Voltar
        </Button>
        <Button type="submit" size="lg" disabled={!valid || pending} className="flex-1">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Bloquear
        </Button>
      </div>
    </form>
  );
}
