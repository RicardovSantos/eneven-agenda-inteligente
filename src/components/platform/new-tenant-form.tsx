"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createTenantAction } from "@/app/admin/actions";
import { FieldError } from "@/components/catalog/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatBRL } from "@/lib/format";
import { formatBrazilPhone } from "@/lib/phone";

export type NewTenantPlan = { id: string; name: string; priceCents: number };

/** Formulário "Novo estabelecimento" (coluna de 640px). Criado, leva à ficha com o aviso "Estabelecimento criado". */
export function NewTenantForm({
  plans,
  defaultPlanId,
}: {
  plans: NewTenantPlan[];
  defaultPlanId: string;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [planId, setPlanId] = useState(defaultPlanId);
  const [trialDays, setTrialDays] = useState("30");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await createTenantAction({
        businessName,
        ownerName,
        ownerEmail,
        whatsapp,
        planId,
        trialDays: trialDays.trim() === "" ? Number.NaN : Number(trialDays),
      });
      if (result.ok && result.tenantId) {
        show(result.message);
        router.push(`/admin/estabelecimentos/${result.tenantId}`);
        return;
      }
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        show(result.error, "error");
      }
    });
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-5 sm:p-6"
    >
      <fieldset disabled={pending} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="n-nome" className="font-semibold">Nome do estabelecimento</Label>
          <Input
            id="n-nome"
            value={businessName}
            maxLength={120}
            autoComplete="off"
            onChange={(e) => setBusinessName(e.target.value)}
            aria-invalid={errors.businessName ? true : undefined}
            aria-describedby={errors.businessName ? "n-nome-erro" : undefined}
            className="h-11"
          />
          <FieldError id="n-nome-erro">{errors.businessName}</FieldError>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="n-dono" className="font-semibold">Nome do dono</Label>
          <Input
            id="n-dono"
            value={ownerName}
            maxLength={120}
            autoComplete="off"
            onChange={(e) => setOwnerName(e.target.value)}
            aria-invalid={errors.ownerName ? true : undefined}
            aria-describedby={errors.ownerName ? "n-dono-erro" : undefined}
            className="h-11"
          />
          <FieldError id="n-dono-erro">{errors.ownerName}</FieldError>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="n-email" className="font-semibold">E-mail do dono</Label>
          <Input
            id="n-email"
            type="email"
            value={ownerEmail}
            maxLength={254}
            autoComplete="off"
            onChange={(e) => setOwnerEmail(e.target.value)}
            aria-invalid={errors.ownerEmail ? true : undefined}
            aria-describedby={errors.ownerEmail ? "n-email-erro" : undefined}
            className="h-11"
          />
          <FieldError id="n-email-erro">{errors.ownerEmail}</FieldError>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="n-whats" className="font-semibold">WhatsApp</Label>
          <Input
            id="n-whats"
            type="tel"
            inputMode="tel"
            value={whatsapp}
            placeholder="(11) 99999-9999"
            autoComplete="off"
            onChange={(e) => setWhatsapp(formatBrazilPhone(e.target.value))}
            aria-invalid={errors.whatsapp ? true : undefined}
            aria-describedby={errors.whatsapp ? "n-whats-erro" : undefined}
            className="h-11 tabular-nums"
          />
          <FieldError id="n-whats-erro">{errors.whatsapp}</FieldError>
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="n-plano" className="font-semibold">Plano</Label>
            <Select
              id="n-plano"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              aria-invalid={errors.planId ? true : undefined}
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {formatBRL(p.priceCents)}
                </option>
              ))}
            </Select>
            <FieldError>{errors.planId}</FieldError>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="n-dias" className="font-semibold">Dias de teste</Label>
            <Input
              id="n-dias"
              type="number"
              inputMode="numeric"
              min={1}
              max={90}
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
              aria-invalid={errors.trialDays ? true : undefined}
              aria-describedby={errors.trialDays ? "n-dias-erro" : undefined}
              className="h-11 tabular-nums"
            />
            <FieldError id="n-dias-erro">{errors.trialDays}</FieldError>
          </div>
        </div>
      </fieldset>

      <p className="text-[0.8125rem] leading-snug text-ink-muted">
        O dono entra sem senha. Depois de criar, envie o acesso por e-mail na ficha do estabelecimento.
      </p>

      <div className="flex flex-wrap gap-2.5 pt-1">
        <Button type="submit" disabled={pending} className="h-[46px] px-5">
          {pending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Criando…
            </>
          ) : (
            "Criar estabelecimento"
          )}
        </Button>
        <Link
          href="/admin"
          className="inline-flex h-[46px] items-center rounded-field border border-border bg-surface px-[18px] text-base font-semibold text-foreground hover:bg-primary-soft"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
