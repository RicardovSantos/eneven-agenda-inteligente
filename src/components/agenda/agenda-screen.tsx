"use client";

import { ChevronLeft, ChevronRight, Copy, Lock, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { deleteBlockAction } from "@/app/painel/actions";
import { ConfirmDialog } from "@/components/catalog/parts";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatLongDate, formatMonthRange } from "@/lib/dates";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DayAgenda, MonthDay } from "@/server/agenda/panel-queries";
import { addDaysToDate } from "@/server/agenda/time";
import { BlockDialog } from "./block-dialog";
import { BookingDetail } from "./booking-detail";
import { DayColumns } from "./day-columns";
import { DayList } from "./day-list";
import { MonthView } from "./month-view";
import { NewBookingDialog, type PanelPro, type PanelService } from "./new-booking-dialog";
import { Dot, agendaHref, formatShortWeekdayDay, useMinuteNow } from "./shared";
import { WeekStrip } from "./week-strip";

const NAV_BUTTON =
  "flex size-10 items-center justify-center rounded-field border border-line bg-surface text-foreground hover:bg-primary-soft";
const TEXT_BUTTON =
  "flex h-10 items-center rounded-field border border-line bg-surface px-3.5 text-sm font-medium text-foreground hover:bg-primary-soft";

export type AgendaScreenProps = {
  today: string;
  date: string;
  view: "mes" | "dia";
  /** "todos" ou o id do profissional filtrado. */
  professionalFilter: string;
  monthDays: MonthDay[];
  /** Dias da faixa da semana (um ou dois meses). */
  stripDays: MonthDay[];
  day: DayAgenda;
  professionals: PanelPro[];
  services: PanelService[];
  /** Profissional que usa o painel (`staff`): sem filtro e campos fixos. */
  lockedProfessionalId: string | null;
  /** Link público para o estado vazio (`null` = ainda não liberado). */
  publicUrl: string | null;
  nowMs: number;
  banners?: ReactNode;
};

/**
 * Agenda do painel: mês com ocupação + lista do dia à direita (≥ 1024px); faixa
 * da semana + lista do dia no celular. O estado (dia, profissional, visão) vive
 * na URL; o detalhe e os diálogos vivem aqui.
 */
export function AgendaScreen({
  today,
  date,
  view,
  professionalFilter,
  monthDays,
  stripDays,
  day,
  professionals,
  services,
  lockedProfessionalId,
  publicUrl,
  nowMs,
  banners,
}: AgendaScreenProps) {
  const router = useRouter();
  const toast = useToast();
  const now = useMinuteNow(nowMs);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockToRemove, setBlockToRemove] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const closeDetail = useCallback(() => setSelectedId(null), []);

  const month = date.slice(0, 7);
  const monthFirst = `${month}-01`;
  const todayMonth = today.slice(0, 7);
  const prevMonth = `${addDaysToDate(monthFirst, -1).slice(0, 7)}-01`;
  const nextMonth = `${addDaysToDate(monthDays[monthDays.length - 1].date, 1).slice(0, 7)}-01`;
  const goMonth = (first: string) => (first.slice(0, 7) === todayMonth ? today : first);
  const pro = professionalFilter;
  const isToday = date === today;

  const stripInfo = new Map(stripDays.map((d) => [d.date, d]));
  const selected = day.items.find((i) => i.kind === "booking" && i.id === selectedId);
  const detail = selected && selected.kind === "booking" ? selected : null;

  const filtered = professionals.find((p) => p.id === pro) ?? null;
  const columns = filtered ? [filtered] : professionals;
  const longDate = formatLongDate(date);
  const summary =
    day.count === 0
      ? "Nenhum agendamento"
      : `${day.count} ${day.count === 1 ? "agendamento" : "agendamentos"} · ${formatBRL(day.totalCents)} previstos`;

  async function removeBlock() {
    if (!blockToRemove || removing) return;
    setRemoving(true);
    try {
      const result = await deleteBlockAction(blockToRemove);
      if (result.ok) toast.show(result.message);
      else toast.show(result.error, "error");
    } catch {
      toast.show("Não foi possível remover agora. Tente novamente em instantes.", "error");
    } finally {
      setRemoving(false);
      setBlockToRemove(null);
    }
  }

  // Profissional só remove bloqueio do próprio profissional (nunca o do estabelecimento todo).
  const canDeleteBlock = (professionalId: string | null) =>
    !lockedProfessionalId || professionalId === lockedProfessionalId;

  async function copyLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.show("Link copiado");
    } catch {
      toast.show("Não foi possível copiar. Selecione e copie o link.", "error");
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:-mx-8 lg:-mb-10 lg:-mt-8 lg:min-h-dvh lg:flex-row lg:gap-0">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-1 lg:gap-5 lg:px-8 lg:pb-10 lg:pt-7">
        {/* Cabeçalho: faixa branca no celular (mês + semana), solta no computador */}
        <div className="-mx-4 -mt-6 flex flex-col gap-3.5 border-b border-line bg-surface px-4 pb-3 pt-4 lg:m-0 lg:gap-4 lg:border-0 lg:bg-transparent lg:p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 lg:gap-4">
            <div className="flex items-center gap-3">
              <h1 className="font-display text-xl font-semibold tracking-[-0.01em] lg:text-[28px]">
                {formatMonthRange(monthFirst, monthFirst)}
              </h1>
              <div className="hidden gap-1 lg:flex">
                <Link
                  href={agendaHref({ data: goMonth(prevMonth), pro, view })}
                  scroll={false}
                  aria-label="Mês anterior"
                  className={NAV_BUTTON}
                >
                  <ChevronLeft className="size-[18px]" aria-hidden="true" />
                </Link>
                <Link
                  href={agendaHref({ data: goMonth(nextMonth), pro, view })}
                  scroll={false}
                  aria-label="Próximo mês"
                  className={NAV_BUTTON}
                >
                  <ChevronRight className="size-[18px]" aria-hidden="true" />
                </Link>
              </div>
              <div className="flex gap-1 lg:hidden">
                <Link
                  href={agendaHref({ data: addDaysToDate(date, -7), pro })}
                  scroll={false}
                  aria-label="Semana anterior"
                  className={cn(NAV_BUTTON, "size-9 border-0 bg-transparent")}
                >
                  <ChevronLeft className="size-[18px]" aria-hidden="true" />
                </Link>
                <Link
                  href={agendaHref({ data: addDaysToDate(date, 7), pro })}
                  scroll={false}
                  aria-label="Próxima semana"
                  className={cn(NAV_BUTTON, "size-9 border-0 bg-transparent")}
                >
                  <ChevronRight className="size-[18px]" aria-hidden="true" />
                </Link>
              </div>
              <Link href={agendaHref({ pro, view })} scroll={false} className={TEXT_BUTTON}>
                Hoje
              </Link>
            </div>

            <div
              role="tablist"
              aria-label="Visualização"
              className="hidden gap-0.5 rounded-xl bg-[color-mix(in_oklch,var(--line)_70%,transparent)] p-1 lg:flex"
            >
              <ViewTab href={agendaHref({ data: date, pro, view: "mes" })} active={view === "mes"}>
                Mês
              </ViewTab>
              <span
                role="tab"
                aria-selected="false"
                aria-disabled="true"
                className="flex h-9 cursor-not-allowed items-center rounded-[9px] px-4 text-sm font-medium text-ink-muted/60"
              >
                Semana
                <span className="sr-only"> (em breve)</span>
              </span>
              <ViewTab href={agendaHref({ data: date, pro, view: "dia" })} active={view === "dia"}>
                Dia
              </ViewTab>
            </div>
          </div>

          <div className="lg:hidden">
            <WeekStrip selected={date} info={stripInfo} professionalId={pro} />
          </div>
        </div>

        {banners}

        {professionals.length > 1 && !lockedProfessionalId ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Profissional">
            <span className="mr-1 text-sm text-ink-muted">Profissional</span>
            <Pill href={agendaHref({ data: date, pro: "todos", view })} active={pro === "todos" || !filtered}>
              Todos
            </Pill>
            {professionals.map((p) => (
              <Pill key={p.id} href={agendaHref({ data: date, pro: p.id, view })} active={filtered?.id === p.id}>
                <Dot color={p.color} size={8} />
                {p.name}
              </Pill>
            ))}
          </div>
        ) : null}

        <div className="hidden lg:block">
          {view === "dia" ? (
            <DayColumns day={day} professionals={columns} isToday={isToday} nowMs={now} onOpen={setSelectedId} />
          ) : (
            <MonthView days={monthDays} selected={date} today={today} professionalId={pro} />
          )}
        </div>
      </div>

      <aside
        aria-label="Agendamentos do dia"
        className="flex flex-col gap-4 lg:sticky lg:top-0 lg:h-dvh lg:w-[360px] lg:shrink-0 min-[1536px]:w-[400px] lg:gap-[18px] lg:overflow-y-auto lg:border-l lg:border-line lg:bg-surface lg:p-6 lg:pt-7"
      >
        <div className={cn("flex flex-col gap-4 lg:gap-[18px]", detail && "lg:hidden")}>
          <div className="flex flex-col gap-1 max-lg:flex-row max-lg:items-baseline max-lg:justify-between">
            <h2 className="font-display text-lg font-semibold lg:text-[22px]">
              <span className="lg:hidden">{formatShortWeekdayDay(date, longDate)}</span>
              <span className="hidden lg:inline">{longDate}</span>
            </h2>
            <p className="text-[13px] tabular-nums text-ink-muted lg:text-sm" data-testid="day-summary">
              {summary}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => setNewOpen(true)}
              size="lg"
              className="hidden min-h-11 min-w-[10.5rem] flex-1 gap-1.5 rounded-field text-sm lg:flex"
            >
              <Plus className="size-[18px]" aria-hidden="true" />
              Novo agendamento
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBlockOpen(true)}
              className="min-h-11 min-w-[9.5rem] flex-1 gap-1.5 rounded-field text-sm"
            >
              <Lock className="size-4" aria-hidden="true" />
              Bloquear horário
            </Button>
          </div>

          {day.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-panel border border-line bg-surface px-5 py-10 text-center lg:border-0 lg:bg-transparent">
              <div className="fio w-24" aria-hidden="true" />
              <p className="max-w-[16rem] text-[0.9375rem] leading-snug text-ink-muted">
                Nenhum agendamento neste dia. Compartilhe seu link para receber reservas.
              </p>
              {publicUrl ? (
                <Button type="button" variant="outline" onClick={copyLink} className="gap-2">
                  <Copy className="size-4" aria-hidden="true" />
                  Copiar link
                </Button>
              ) : null}
            </div>
          ) : (
            <DayList
              day={day}
              isToday={isToday}
              nowMs={now}
              onOpen={setSelectedId}
              canDeleteBlock={canDeleteBlock}
              onDeleteBlock={setBlockToRemove}
            />
          )}
        </div>

        {detail ? (
          <BookingDetail
            key={detail.id}
            booking={detail}
            today={today}
            timezone={day.timezone}
            onClose={closeDetail}
          />
        ) : null}
      </aside>

      {/* Botão flutuante (celular) */}
      <button
        type="button"
        onClick={() => setNewOpen(true)}
        aria-label="Novo agendamento"
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-[18px] z-30 flex size-14 cursor-pointer items-center justify-center rounded-[18px] bg-primary text-primary-foreground shadow-[0_12px_32px_-12px_rgb(62_7_210/0.6)] lg:hidden"
      >
        <Plus className="size-6" strokeWidth={2.4} aria-hidden="true" />
      </button>

      <NewBookingDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        today={today}
        timezone={day.timezone}
        services={services}
        professionals={professionals}
        defaultProfessionalId={filtered?.id ?? null}
        lockedProfessionalId={lockedProfessionalId}
        onCreated={(booked) => router.push(agendaHref({ data: booked, pro, view }))}
      />
      <ConfirmDialog
        open={blockToRemove !== null}
        title="Remover bloqueio?"
        titleId="block-confirm-title"
        confirmLabel="Remover"
        pending={removing}
        onCancel={() => setBlockToRemove(null)}
        onConfirm={removeBlock}
      >
        O horário volta a ficar livre.
      </ConfirmDialog>
      <BlockDialog
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        date={date}
        timezone={day.timezone}
        professionals={professionals}
        lockedProfessionalId={lockedProfessionalId}
        defaultProfessionalId={filtered?.id ?? null}
      />
    </div>
  );
}

function ViewTab({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      role="tab"
      aria-selected={active}
      className={cn(
        "flex h-9 items-center rounded-[9px] px-4 text-sm",
        active
          ? "bg-surface font-semibold text-foreground shadow-[0_1px_2px_rgb(41_48_60/0.12)]"
          : "font-medium text-ink-muted hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function Pill({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm",
        active
          ? "border-primary bg-primary-soft font-semibold text-primary"
          : "border-line bg-surface font-medium text-foreground hover:bg-primary-soft/60",
      )}
    >
      {children}
    </Link>
  );
}
