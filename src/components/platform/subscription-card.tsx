"use client";

import { Ellipsis } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  activateTenantAction,
  blockTenantAction,
  cancelTenantAction,
  changePlanAction,
  extendTrialAction,
  type AdminActionResult,
} from "@/app/admin/actions";
import { ConfirmDialog } from "@/components/catalog/parts";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatBRL } from "@/lib/format";
import { situationLabel } from "@/lib/platform-format";
import type { TenantSituation } from "@/server/tenants/release";

export type PlanOption = {
  id: string;
  name: string;
  priceCents: number;
  maxProfessionals: number | null;
  active: boolean;
};

export const planOptionLabel = (p: PlanOption) =>
  `${p.name} · ${formatBRL(p.priceCents)} · ${
    p.maxProfessionals === null ? "profissionais ilimitados" : `até ${p.maxProfessionals} profissionais`
  }`;

type Props = {
  tenantId: string;
  tenantName: string;
  status: "trial" | "active" | "past_due" | "read_only" | "canceled";
  situation: TenantSituation;
  planId: string;
  plans: PlanOption[];
  /** "29/10/2026, em 2 dias" (ou `null` quando não há prazo a mostrar). */
  trialLine: { label: string; value: string } | null;
  signupLine: string;
  canExtendTrial: boolean;
};

const PILL =
  "min-h-10 cursor-pointer rounded-full border border-line bg-surface px-3.5 text-sm font-semibold text-ink hover:bg-primary-soft disabled:cursor-default disabled:opacity-50";

/** Cartão "Assinatura" da ficha: situação, plano, estender teste, ativar, bloquear e cancelar. */
export function SubscriptionCard({
  tenantId,
  tenantName,
  status,
  situation,
  planId,
  plans,
  trialLine,
  signupLine,
  canExtendTrial,
}: Props) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<"block" | "cancel" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [plan, setPlan] = useState(planId);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const run = (work: () => Promise<AdminActionResult>, after?: (ok: boolean) => void) =>
    startTransition(async () => {
      const result = await work();
      show(result.ok ? result.message : result.error, result.ok ? "success" : "error");
      after?.(result.ok);
    });

  const canBlock = status === "trial" || status === "active" || status === "past_due";
  const canActivate = status !== "active";
  const canCancel = status !== "canceled";

  return (
    <section
      aria-labelledby="t-assin"
      className="flex flex-col gap-4 rounded-panel border border-line bg-surface px-5 py-5 sm:px-6"
    >
      <h2 id="t-assin" className="font-display text-xl font-semibold">
        Assinatura
      </h2>

      <dl className="m-0 grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-y-2.5 text-[0.9375rem] sm:grid-cols-[140px_minmax(0,1fr)]">
        <dt className="text-ink-muted">Situação</dt>
        <dd className="m-0 font-semibold">{situationLabel(situation)}</dd>
        {trialLine ? (
          <>
            <dt className="text-ink-muted">{trialLine.label}</dt>
            <dd className="m-0 font-semibold tabular-nums">{trialLine.value}</dd>
          </>
        ) : null}
        <dt className="text-ink-muted">Cadastro</dt>
        <dd className="m-0 font-semibold tabular-nums">{signupLine}</dd>
      </dl>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="a-plano" className="text-sm font-semibold">
          Plano
        </Label>
        <Select
          id="a-plano"
          value={plan}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value;
            setPlan(next);
            run(
              () => changePlanAction(tenantId, next),
              (ok) => {
                if (!ok) setPlan(planId);
              },
            );
          }}
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {planOptionLabel(p)}
              {p.active ? "" : " (inativo)"}
            </option>
          ))}
        </Select>
      </div>

      {canExtendTrial ? (
        <div className="flex flex-col gap-2">
          <span id="estender-teste" className="text-sm font-semibold">
            Estender o teste
          </span>
          <div role="group" aria-labelledby="estender-teste" className="flex flex-wrap gap-2">
            {([7, 14, 30] as const).map((days) => (
              <button
                key={days}
                type="button"
                disabled={pending}
                onClick={() => run(() => extendTrialAction(tenantId, days))}
                className={PILL}
              >
                + {days} dias
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2.5 border-t border-line/70 pt-4">
        {canActivate ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(() => activateTenantAction(tenantId))}
            className="px-4 text-[0.9375rem]"
          >
            Ativar assinatura
          </Button>
        ) : null}
        {canBlock ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setConfirm("block")}
            className="px-4 text-[0.9375rem] text-[#C2410C] dark:text-danger"
          >
            Bloquear
          </Button>
        ) : null}
        {canCancel ? (
          <div ref={menuRef} className="relative">
            <Button
              type="button"
              variant="outline"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              disabled={pending}
              onClick={() => setMenuOpen((open) => !open)}
              className="gap-2 px-4 text-[0.9375rem]"
            >
              <Ellipsis className="size-[18px]" aria-hidden="true" />
              Mais ações
            </Button>
            {menuOpen ? (
              <div
                role="menu"
                aria-label="Mais ações"
                className="absolute left-0 top-[calc(100%+0.375rem)] z-10 min-w-48 rounded-field border border-line bg-surface p-1 shadow-float"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirm("cancel");
                  }}
                  className="flex min-h-11 w-full cursor-pointer items-center rounded-[8px] px-3 text-left text-[0.9375rem] font-semibold text-[#C2410C] hover:bg-danger-soft dark:text-danger"
                >
                  Cancelar conta
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="text-[0.8125rem] leading-snug text-ink-muted">
        Bloquear deixa o painel só para consulta e tira a página de agendamento do ar. Os dados ficam
        guardados.
      </p>

      <ConfirmDialog
        open={confirm === "block"}
        titleId="bloquear-titulo"
        title={`Bloquear ${tenantName}?`}
        confirmLabel="Bloquear"
        pending={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(() => blockTenantAction(tenantId), () => setConfirm(null))}
      >
        O painel passa a ser só para consulta e a página de agendamento sai do ar. Os dados ficam
        guardados e dá para ativar de novo.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "cancel"}
        titleId="cancelar-titulo"
        title={`Cancelar a conta de ${tenantName}?`}
        confirmLabel="Cancelar conta"
        pending={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(() => cancelTenantAction(tenantId), () => setConfirm(null))}
      >
        A página de agendamento sai do ar e o painel fica só para consulta. Os dados não são apagados.
      </ConfirmDialog>
    </section>
  );
}
