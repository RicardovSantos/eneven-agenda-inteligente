"use client";

import { ChevronLeft, ChevronRight, MessageCircle, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateClientNotesAction } from "@/app/painel/clientes/actions";
import {
  NewBookingDialog,
  type PanelPro,
  type PanelService,
} from "@/components/agenda/new-booking-dialog";
import { STATUS_BADGE, STATUS_LABEL } from "@/components/agenda/shared";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { ClientFormDialog } from "./client-form-dialog";
import type { ClientProfileView } from "./view";

export type BookingOptions = {
  today: string;
  timezone: string;
  services: PanelService[];
  professionals: PanelPro[];
  lockedProfessionalId: string | null;
};

const TILE = "flex flex-col-reverse gap-0.5 rounded-xl bg-canvas px-3.5 py-3";
const TILE_VALUE = "font-display text-[1.375rem] font-semibold tabular-nums";

/**
 * Ficha do cliente: coluna à direita da lista no computador; página inteira
 * ("‹ Clientes") no celular. O que muda de forma entre os dois vive aqui.
 */
export function ClientProfile({
  profile,
  canEdit,
  listHref,
  allHistoryHref,
  booking,
}: {
  profile: ClientProfileView;
  canEdit: boolean;
  /** Lista com a busca e o filtro de antes (fechar / "‹ Clientes"). */
  listHref: string;
  /** "Ver todos os N" (`null` quando o histórico já está completo). */
  allHistoryHref: string | null;
  /** Dados do novo agendamento; `null` esconde o botão "Agendar". */
  booking: BookingOptions | null;
}) {
  const router = useRouter();
  const [scheduling, setScheduling] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <>
      {/* Barra do celular */}
      <div className="-mx-4 -mt-6 mb-4 flex items-center justify-between border-b border-line bg-surface py-2 pl-1 pr-2 lg:hidden">
        <Link href={listHref} className="flex min-h-11 items-center gap-1 px-2 text-base font-medium text-foreground">
          <ChevronLeft className="size-[22px]" aria-hidden="true" />
          Clientes
        </Link>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-11 cursor-pointer px-3 text-[0.9375rem] font-semibold text-primary hover:underline"
          >
            Editar
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 lg:gap-5">
        {/* Identificação */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            <span
              aria-hidden="true"
              className="grid size-14 shrink-0 place-items-center rounded-full bg-primary-soft font-display text-xl font-semibold text-primary lg:size-[52px] lg:text-lg"
            >
              {profile.initials}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              {/* Um só título de nível 1 por tela: no celular a ficha é a página (h1); no computador a lista é. */}
              <h1 className="break-words font-display text-[1.375rem] font-semibold leading-tight lg:hidden">
                {profile.name}
              </h1>
              <h2
                id="titulo-cliente"
                className="break-words font-display text-[1.375rem] font-semibold leading-tight max-lg:hidden"
              >
                {profile.name}
              </h2>
              <span className="text-sm text-ink-muted max-lg:tabular-nums">
                <span className="lg:hidden">{profile.phoneLabel}</span>
                <span className="max-lg:hidden">{profile.since}</span>
              </span>
              {profile.email ? (
                <span className="break-all text-[0.8125rem] text-ink-muted lg:hidden">{profile.email}</span>
              ) : null}
            </div>
          </div>
          <Link
            href={listHref}
            aria-label="Fechar"
            className="flex size-10 shrink-0 items-center justify-center rounded-field text-ink-muted hover:bg-primary-soft hover:text-foreground max-lg:hidden"
          >
            <X className="size-5" aria-hidden="true" />
          </Link>
        </div>

        {/* Ações */}
        <div className="flex gap-2">
          {booking ? (
            <Button onClick={() => setScheduling(true)} className="h-[46px] flex-1 lg:h-11">
              <Plus className="size-[18px]" aria-hidden="true" />
              Agendar
            </Button>
          ) : null}
          <a
            href={profile.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-[46px] flex-1 items-center justify-center gap-2 rounded-field border border-line bg-surface text-base font-semibold text-foreground hover:bg-primary-soft lg:h-11"
          >
            <MessageCircle className="size-[18px]" aria-hidden="true" />
            WhatsApp
          </a>
        </div>

        {/* Números: faixa de 3 no celular, 4 cartões no computador */}
        <dl
          className={cn(
            "grid rounded-[14px] border border-line bg-surface lg:hidden",
            profile.total !== null ? "grid-cols-3" : "grid-cols-2",
          )}
        >
          <Stat label="Visitas" value={String(profile.visits)} />
          {profile.total !== null ? (
            <Stat label="Total gasto" value={profile.total.replace(/,00$/, "")} />
          ) : null}
          <Stat label="Faltas" value={String(profile.noShows)} last />
        </dl>
        <dl className="grid grid-cols-2 gap-2.5 max-lg:hidden">
          <div className={TILE}>
            <dt className="text-[0.8125rem] text-ink-muted">Visitas</dt>
            <dd className={TILE_VALUE}>{profile.visits}</dd>
          </div>
          {profile.total !== null ? (
            <div className={TILE}>
              <dt className="text-[0.8125rem] text-ink-muted">Total gasto</dt>
              <dd className={TILE_VALUE}>{profile.total}</dd>
            </div>
          ) : null}
          <div className={TILE}>
            <dt className="text-[0.8125rem] text-ink-muted">Faltas</dt>
            <dd className={TILE_VALUE}>{profile.noShows}</dd>
          </div>
          <div className={TILE}>
            <dt className="text-[0.8125rem] text-ink-muted">Volta a cada</dt>
            <dd className={TILE_VALUE}>{profile.returnLabel}</dd>
          </div>
        </dl>

        {/* Próximo horário (celular) */}
        {profile.next ? (
          <Link
            href={`/painel?data=${profile.next.date}`}
            className="flex items-center gap-3 rounded-[14px] bg-primary-soft px-3.5 py-3 text-foreground lg:hidden"
          >
            <span className="flex w-12 shrink-0 flex-col items-center justify-center text-primary">
              <span className="text-xs font-semibold">{profile.next.weekday}</span>
              <span className="font-display text-[1.375rem] font-semibold leading-[1.1] tabular-nums">
                {profile.next.day}
              </span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[0.8125rem] text-ink-muted">Próximo horário</span>
              <span className="text-[0.9375rem] font-semibold tabular-nums">{profile.next.text}</span>
            </span>
            <ChevronRight className="size-[18px] shrink-0 text-ink-muted" aria-hidden="true" />
          </Link>
        ) : null}

        {/* Contato (computador) */}
        <div className="flex flex-col gap-1.5 text-[0.9375rem] max-lg:hidden">
          <span className="flex justify-between gap-3">
            <span className="text-ink-muted">WhatsApp</span>
            <span className="font-semibold tabular-nums">{profile.phoneLabel}</span>
          </span>
          <span className="flex justify-between gap-3">
            <span className="text-ink-muted">E-mail</span>
            <span className="min-w-0 break-all text-right font-semibold">{profile.email ?? "—"}</span>
          </span>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex min-h-8 cursor-pointer items-center self-start text-sm font-semibold text-primary hover:underline"
            >
              Editar dados
            </button>
          ) : null}
        </div>

        <Notes key={`${profile.id}:${profile.notes}`} id={profile.id} initial={profile.notes} />

        {/* Histórico */}
        <section
          aria-labelledby="titulo-historico"
          className="flex flex-col gap-1 max-lg:rounded-[14px] max-lg:border max-lg:border-line max-lg:bg-surface max-lg:px-3.5 max-lg:py-1"
        >
          <h2 id="titulo-historico" className="pb-1.5 pt-2.5 text-[0.9375rem] font-semibold lg:pt-0">
            Histórico
          </h2>
          {profile.history.length === 0 ? (
            <p className="pb-3 text-sm text-ink-muted">Ainda sem atendimentos.</p>
          ) : (
            <ul className="flex flex-col">
              {profile.history.map((h) => (
                <li key={h.key} className="flex items-center gap-3 border-t border-line/60 py-2.5">
                  <span className="w-11 shrink-0 font-display text-[0.9375rem] font-semibold tabular-nums lg:w-[46px]">
                    {h.date}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[0.9375rem] font-semibold">{h.service}</span>
                    <span className="text-[0.8125rem] text-ink-muted">com {h.pro}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="text-sm tabular-nums max-lg:hidden">{h.price}</span>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-[3px] text-xs font-semibold lg:py-0.5",
                        STATUS_BADGE[h.status],
                      )}
                    >
                      {STATUS_LABEL[h.status]}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {allHistoryHref ? (
            <Link
              href={allHistoryHref}
              scroll={false}
              className="flex min-h-9 items-center self-start text-sm font-semibold text-primary hover:underline"
            >
              Ver todos os {profile.historyTotal}
            </Link>
          ) : null}
        </section>
      </div>

      {canEdit ? (
        <ClientFormDialog
          open={editing}
          onClose={() => setEditing(false)}
          client={{
            id: profile.id,
            name: profile.name,
            phone: profile.phone,
            email: profile.email ?? "",
            notes: profile.notes,
          }}
        />
      ) : null}
      {booking ? (
        <NewBookingDialog
          open={scheduling}
          onClose={() => setScheduling(false)}
          today={booking.today}
          timezone={booking.timezone}
          services={booking.services}
          professionals={booking.professionals}
          defaultProfessionalId={null}
          lockedProfessionalId={booking.lockedProfessionalId}
          initialCustomer={{ id: profile.id, name: profile.name, phone: profile.phone }}
          onCreated={(date) => router.push(`/painel?data=${date}`)}
        />
      ) : null}
    </>
  );
}

function Stat({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div className={cn("flex flex-col-reverse gap-0.5 p-3", !last && "border-r border-line/60")}>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="font-display text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** Observações: salvam ao sair do campo ("Observações salvas"). */
function Notes({ id, initial }: { id: string; initial: string }) {
  const toast = useToast();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);

  async function save() {
    const next = value.trim();
    if (next === saved.trim()) return;
    try {
      const result = await updateClientNotesAction(id, next);
      if (result.ok) {
        setSaved(next);
        setValue(next);
        toast.show(result.message);
      } else {
        toast.show(result.error, "error");
      }
    } catch {
      toast.show("Não foi possível salvar agora. Tente novamente em instantes.", "error");
    }
  }

  return (
    <div className="flex flex-col gap-1.5 max-lg:rounded-[14px] max-lg:border max-lg:border-line max-lg:bg-surface max-lg:px-3.5 max-lg:py-3">
      <label htmlFor="client-notes" className="text-sm font-semibold max-lg:text-[0.8125rem] max-lg:text-ink-muted">
        Observações
      </label>
      <textarea
        id="client-notes"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        maxLength={500}
        rows={2}
        placeholder="Alergias, preferências, o que vale lembrar"
        className="min-h-16 w-full resize-none rounded-field border border-line bg-surface px-3.5 py-2.5 text-[0.9375rem] leading-snug text-foreground outline-none placeholder:text-ink-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-lg:min-h-0 max-lg:border-0 max-lg:p-0 max-lg:focus-visible:outline-0"
      />
    </div>
  );
}
