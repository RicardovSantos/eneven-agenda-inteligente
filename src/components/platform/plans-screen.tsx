"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { updatePlanAction } from "@/app/admin/actions";
import { EditPanel, FieldError, StatusBadge } from "@/components/catalog/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { centsFromDigits, formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PlanItem = {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  maxProfessionals: number | null;
  monthlyMessages: number;
  active: boolean;
  tenantCount: number;
};

const BR = new Intl.NumberFormat("pt-BR");
const professionalsLabel = (p: PlanItem) =>
  p.maxProfessionals === null ? "Ilimitados" : `Até ${p.maxProfessionals}`;

/** Planos no layout de "Serviços": tabela à esquerda e painel de edição à direita (tela cheia no celular). */
export function PlansScreen({ plans }: { plans: PlanItem[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const editing = plans.find((p) => p.id === selectedId);

  return (
    <div className="lg:flex lg:min-h-[calc(100dvh-4rem)]">
      <main className="mx-auto flex w-full min-w-0 max-w-[1100px] flex-col gap-5 px-4 pb-10 pt-6 lg:mx-0 lg:max-w-none lg:flex-1 lg:px-8 lg:pt-7">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[1.75rem] font-semibold">Planos</h1>
          <p className="text-sm text-ink-muted">
            Preço e limites de cada plano. Quem já está em um plano continua nele se você o desativar.
          </p>
        </div>

        <div className="hidden overflow-x-auto rounded-panel border border-line bg-surface lg:block">
          <table className="w-full min-w-[640px] border-collapse text-[0.9375rem]">
            <thead>
              <tr className="text-left text-[0.8125rem] text-ink-muted">
                <th scope="col" className="border-b border-line px-5 py-3.5 font-semibold">Plano</th>
                <th scope="col" className="border-b border-line px-3 py-3.5 font-semibold">Preço</th>
                <th scope="col" className="border-b border-line px-3 py-3.5 font-semibold">Profissionais</th>
                <th scope="col" className="border-b border-line px-3 py-3.5 font-semibold">Mensagens/mês</th>
                <th scope="col" className="border-b border-line px-3 py-3.5 text-right font-semibold">Estabelecimentos usando</th>
                <th scope="col" className="border-b border-line px-5 py-3.5 font-semibold">Ativo</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={cn(
                    "cursor-pointer hover:bg-primary-soft/40",
                    selectedId === p.id && "bg-primary-soft/60 shadow-[inset_3px_0_0_var(--primary)]",
                    !p.active && "text-ink-muted",
                  )}
                >
                  <td className="border-b border-line/60 px-5 py-3.5 font-semibold">
                    <button
                      type="button"
                      aria-pressed={selectedId === p.id}
                      className="text-left font-semibold outline-none focus-visible:underline"
                    >
                      {p.name}
                    </button>
                  </td>
                  <td className="border-b border-line/60 px-3 py-3.5 whitespace-nowrap tabular-nums">{formatBRL(p.priceCents)}</td>
                  <td className="border-b border-line/60 px-3 py-3.5 whitespace-nowrap">{professionalsLabel(p)}</td>
                  <td className="border-b border-line/60 px-3 py-3.5 tabular-nums">{BR.format(p.monthlyMessages)}</td>
                  <td className="border-b border-line/60 px-3 py-3.5 text-right tabular-nums">{p.tenantCount}</td>
                  <td className="border-b border-line/60 px-5 py-3.5">
                    <StatusBadge tone={p.active ? "on" : "off"}>{p.active ? "Ativo" : "Inativo"}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="flex flex-col overflow-hidden rounded-panel border border-line bg-surface lg:hidden">
          {plans.map((p) => (
            <li key={p.id} className="border-b border-line/60 last:border-b-0">
              <button
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={cn(
                  "flex min-h-[4.5rem] w-full flex-col justify-center gap-1 px-4 py-3 text-left",
                  !p.active && "text-ink-muted",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{p.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-sm tabular-nums">{formatBRL(p.priceCents)}</span>
                    <StatusBadge tone={p.active ? "on" : "off"}>{p.active ? "Ativo" : "Inativo"}</StatusBadge>
                  </span>
                </span>
                <span className="flex flex-wrap gap-x-3 text-sm text-ink-muted">
                  <span>{professionalsLabel(p)} profissionais</span>
                  <span className="tabular-nums">{BR.format(p.monthlyMessages)} mensagens/mês</span>
                  <span className="tabular-nums">
                    {p.tenantCount} {p.tenantCount === 1 ? "estabelecimento" : "estabelecimentos"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </main>

      {editing ? (
        <EditPanel
          title="Editar plano"
          titleId="titulo-editar-plano"
          stickyClass="lg:top-22 lg:h-[calc(100dvh-5.5rem)]"
          onClose={() => setSelectedId(null)}
        >
          <PlanForm key={editing.id} plan={editing} onClose={() => setSelectedId(null)} />
        </EditPanel>
      ) : null}
    </div>
  );
}

function PlanForm({ plan, onClose }: { plan: PlanItem; onClose: () => void }) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(plan.name);
  const [priceCents, setPriceCents] = useState(plan.priceCents);
  const [maxProfessionals, setMaxProfessionals] = useState(
    plan.maxProfessionals === null ? "" : String(plan.maxProfessionals),
  );
  const [monthlyMessages, setMonthlyMessages] = useState(String(plan.monthlyMessages));
  const [active, setActive] = useState(plan.active);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await updatePlanAction(plan.id, {
        name,
        priceCents,
        maxProfessionals: maxProfessionals.trim() === "" ? null : Number(maxProfessionals),
        monthlyMessages: monthlyMessages.trim() === "" ? Number.NaN : Number(monthlyMessages),
        active,
      });
      if (result.ok) {
        setErrors({});
        show(result.message);
      } else {
        setErrors(result.fieldErrors ?? {});
        show(result.error, "error");
      }
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <fieldset disabled={pending} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="p-nome" className="font-semibold">Nome</Label>
          <Input
            id="p-nome"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={errors.name ? true : undefined}
            className="h-11"
          />
          <FieldError>{errors.name}</FieldError>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="p-preco" className="font-semibold">Preço por mês</Label>
          <Input
            id="p-preco"
            inputMode="numeric"
            autoComplete="off"
            value={formatBRL(priceCents)}
            onChange={(e) => setPriceCents(centsFromDigits(e.target.value, 10_000_000))}
            aria-invalid={errors.priceCents ? true : undefined}
            className="h-11 tabular-nums"
          />
          <FieldError>{errors.priceCents}</FieldError>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="p-prof" className="font-semibold">Até quantos profissionais</Label>
          <Input
            id="p-prof"
            type="number"
            inputMode="numeric"
            min={1}
            value={maxProfessionals}
            placeholder="Ilimitados"
            onChange={(e) => setMaxProfessionals(e.target.value)}
            aria-invalid={errors.maxProfessionals ? true : undefined}
            className="h-11 tabular-nums"
          />
          <span className="text-[0.8125rem] text-ink-muted">Deixe vazio para não ter limite.</span>
          <FieldError>{errors.maxProfessionals}</FieldError>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="p-msgs" className="font-semibold">Mensagens por mês</Label>
          <Input
            id="p-msgs"
            type="number"
            inputMode="numeric"
            min={0}
            value={monthlyMessages}
            onChange={(e) => setMonthlyMessages(e.target.value)}
            aria-invalid={errors.monthlyMessages ? true : undefined}
            className="h-11 tabular-nums"
          />
          <FieldError>{errors.monthlyMessages}</FieldError>
        </div>

        <div className="flex min-h-11 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-semibold">Ativo</span>
            <span className="text-[0.8125rem] text-ink-muted">
              Desligado, o plano some da escolha. Quem já usa continua nele.
            </span>
          </div>
          <Switch checked={active} onCheckedChange={setActive} label="Plano ativo" disabled={pending} />
        </div>
      </fieldset>

      <div className="flex gap-2.5 pt-1">
        <Button type="submit" disabled={pending} className="h-[46px] flex-1">
          {pending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Salvando…
            </>
          ) : (
            "Salvar alterações"
          )}
        </Button>
        <Button type="button" variant="outline" onClick={onClose} className="h-[46px] px-[18px]">
          Cancelar
        </Button>
      </div>
    </form>
  );
}
