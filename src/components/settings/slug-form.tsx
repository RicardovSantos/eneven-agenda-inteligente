"use client";

import { Check, CircleAlert, Loader2, TriangleAlert } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import {
  checkSlugAction,
  saveSlugAction,
  type SettingsFormState,
} from "@/app/painel/configuracoes/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToastOnResult } from "@/components/ui/toast";
import { PUBLIC_HOST } from "@/lib/brand";
import { slugify } from "@/lib/slugify";
import { SaveRow, SettingsSection } from "./settings-section";

type Status = "available" | "current" | "taken" | "reserved" | "invalid";

export function SlugForm({ currentSlug }: { currentSlug: string }) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(
    saveSlugAction,
    {},
  );
  useToastOnResult(state);

  const [raw, setRaw] = useState(currentSlug);
  // Resultado da última verificação feita no servidor (vale só para esse slug).
  const [remote, setRemote] = useState<{ slug: string; status: Status } | null>(null);

  const normalized = raw.trim() === "" ? "" : slugify(raw);
  const changed = normalized !== "" && normalized !== currentSlug;

  // Verifica a disponibilidade 400 ms depois da última tecla.
  useEffect(() => {
    if (!normalized || normalized === currentSlug) return;
    const timer = setTimeout(async () => {
      const result = await checkSlugAction(normalized);
      setRemote({ slug: normalized, status: result.status });
    }, 400);
    return () => clearTimeout(timer);
  }, [normalized, currentSlug]);

  const check: { kind: Status | "checking" } = !normalized
    ? { kind: "invalid" }
    : normalized === currentSlug
      ? { kind: "current" }
      : remote?.slug === normalized
        ? { kind: remote.status }
        : { kind: "checking" };

  const serverError = state.fieldErrors?.slug;
  const blocked = check.kind === "taken" || check.kind === "reserved" || check.kind === "invalid";
  const message = serverError
    ? { tone: "error" as const, text: serverError }
    : check.kind === "taken"
      ? { tone: "error" as const, text: "Esse link já está em uso." }
      : check.kind === "reserved"
        ? { tone: "error" as const, text: "Esse link não está disponível. Escolha outro." }
        : check.kind === "available"
          ? { tone: "ok" as const, text: "Link disponível." }
          : null;

  return (
    <SettingsSection
      id="link"
      title="Seu link"
      description="É o endereço que você compartilha com seus clientes."
    >
      <form action={formAction} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slug">Endereço da sua agenda</Label>
          <div className="flex min-w-0 items-stretch rounded-field border border-input bg-surface focus-within:border-accent focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent has-[[aria-invalid=true]]:border-danger">
            <span className="flex shrink-0 items-center rounded-l-field border-r border-line bg-canvas px-3 text-sm text-ink-muted">
              {PUBLIC_HOST}/
            </span>
            <Input
              id="slug"
              name="slug"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onBlur={() => normalized && setRaw(normalized)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={60}
              className="h-11 flex-1 rounded-l-none border-0 outline-none focus-visible:outline-none"
              aria-invalid={message?.tone === "error" ? true : undefined}
              aria-describedby="slug-msg"
            />
          </div>
          <div id="slug-msg" className="min-h-5 text-[0.8125rem] leading-snug">
            {check.kind === "checking" ? (
              <span className="flex items-center gap-1.5 text-ink-muted">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                Verificando…
              </span>
            ) : message ? (
              <span
                role={message.tone === "error" ? "alert" : "status"}
                className={`flex items-center gap-1.5 ${message.tone === "error" ? "text-danger" : "text-success"}`}
              >
                {message.tone === "error" ? (
                  <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <Check className="size-3.5 shrink-0" aria-hidden="true" />
                )}
                {message.text}
              </span>
            ) : (
              <span className="text-ink-muted">
                Use letras, números e hífen. Ex.: studio-defendi
              </span>
            )}
          </div>
        </div>

        <p className="rounded-field bg-canvas px-4 py-3 text-sm leading-snug">
          <span className="text-ink-muted">Seu link ficará: </span>
          <strong className="break-all font-semibold">
            {PUBLIC_HOST}/{normalized || "…"}
          </strong>
        </p>

        {changed ? (
          <p
            role="note"
            className="flex items-start gap-2.5 rounded-field border-l-[3px] border-danger bg-danger-soft px-4 py-3 text-sm leading-snug"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            <span>
              <strong className="font-semibold">Links antigos deixam de funcionar.</strong>{" "}
              Quem tiver o endereço atual precisará do novo.
            </span>
          </p>
        ) : null}

        <SaveRow
          pending={pending}
          disabled={!changed || blocked || check.kind === "checking"}
          error={state.error}
        />
      </form>
    </SettingsSection>
  );
}
