"use client";

import { Check, ImagePlus } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import {
  removeLogoAction,
  saveBrandColorAction,
  saveBusinessInfoAction,
  uploadLogoAction,
} from "@/app/painel/configuracoes/actions";
import { TextField } from "@/components/auth/text-field";
import { BRAND_SUGGESTIONS, BrandAvatar } from "@/components/settings/brand-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ensureReadableBrandColor, isHexColor, normalizeHex } from "@/lib/color";
import { formatBrazilPhone } from "@/lib/phone";
import { StepCard } from "./parts";

const LOGO_MAX_BYTES = 1024 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

const withoutLogo = (errors: Record<string, string>) => {
  const rest = { ...errors };
  delete rest.logo;
  return rest;
};

export type BusinessStepData = {
  name: string;
  whatsapp: string;
  address: string;
  instagram: string;
  about: string;
  color: string;
  logoUrl: string | null;
};

/** Etapa 1: logo, cor da marca, WhatsApp e endereço. */
export function StepBusiness({
  initial,
  onDone,
}: {
  initial: BusinessStepData;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [logoBusy, setLogoBusy] = useState(false);
  const [whatsapp, setWhatsapp] = useState(formatBrazilPhone(initial.whatsapp));
  const [address, setAddress] = useState(initial.address);
  const [hex, setHex] = useState(initial.color.toUpperCase());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const validHex = isHexColor(hex);
  const { color: usedColor, adjusted } = ensureReadableBrandColor(validHex ? hex : initial.color);
  const logoBusyOrPending = logoBusy || pending;

  const onHexChange = (value: string) => {
    let next = value.trim().toUpperCase();
    if (next && !next.startsWith("#")) next = `#${next}`;
    setHex(next.slice(0, 7));
  };

  const sendLogo = async (file: File | undefined) => {
    setErrors((e) => withoutLogo(e));
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      setErrors((e) => ({ ...e, logo: "Envie uma imagem PNG, JPG ou WebP." }));
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setErrors((e) => ({ ...e, logo: "A imagem pode ter no máximo 1 MB." }));
      return;
    }
    setLogoBusy(true);
    const form = new FormData();
    form.set("logo", file);
    const result = await uploadLogoAction({}, form);
    setLogoBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (result.error || result.fieldErrors?.logo) {
      setErrors((e) => ({ ...e, logo: result.fieldErrors?.logo ?? result.error ?? "" }));
      return;
    }
  };

  const removeLogo = async () => {
    setLogoBusy(true);
    const result = await removeLogoAction({});
    setLogoBusy(false);
    if (result.error) setErrors((e) => ({ ...e, logo: result.error ?? "" }));
  };

  const save = () => {
    setError(null);
    setErrors((e): Record<string, string> => (e.logo ? { logo: e.logo } : {}));
    startTransition(async () => {
      const form = new FormData();
      form.set("name", initial.name);
      form.set("whatsapp", whatsapp);
      form.set("address", address);
      // Estes dois não aparecem aqui: seguem como estão.
      form.set("instagram", initial.instagram);
      form.set("about", initial.about);
      const info = await saveBusinessInfoAction({}, form);
      if (info.error || info.fieldErrors) {
        setErrors(info.fieldErrors ?? {});
        setError(info.error ?? null);
        return;
      }
      const colorForm = new FormData();
      colorForm.set("color", hex);
      const color = await saveBrandColorAction({}, colorForm);
      if (color.error || color.fieldErrors) {
        setErrors({ color: color.fieldErrors?.color ?? "" });
        setError(color.error ?? null);
        return;
      }
      onDone();
    });
  };

  return (
    <StepCard
      title="Seu estabelecimento"
      description="Aparecem na sua página de agendamento. Dá para mudar depois em Configurações."
      onNext={save}
      busy={pending}
      nextDisabled={!validHex || logoBusy}
      error={error}
    >
      <div className="flex flex-col gap-6">
        {/* Logo */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium leading-snug">Logo (opcional)</p>
          <div className="flex items-center gap-4">
            <BrandAvatar
              color={usedColor}
              name={initial.name}
              logoUrl={initial.logoUrl}
              size={72}
              busy={logoBusy}
            />
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  id="onboarding-logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(e) => void sendLogo(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={logoBusyOrPending}
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus aria-hidden="true" />
                  {initial.logoUrl ? "Trocar logo" : "Enviar logo"}
                </Button>
                {initial.logoUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={logoBusyOrPending}
                    onClick={() => void removeLogo()}
                    className="text-danger hover:text-danger"
                  >
                    Remover
                  </Button>
                ) : null}
              </div>
              <p className="text-[0.8125rem] leading-snug text-ink-muted">
                PNG, JPG ou WebP, até 1 MB. Fica redondo.
              </p>
            </div>
          </div>
          {errors.logo ? (
            <p role="alert" className="text-[0.8125rem] leading-snug text-danger">
              {errors.logo}
            </p>
          ) : null}
        </div>

        {/* Cor */}
        <div className="flex flex-col gap-3">
          <p id="onb-color-label" className="text-sm font-medium leading-snug">
            Cor da marca
          </p>
          <div role="radiogroup" aria-labelledby="onb-color-label" className="flex flex-wrap gap-2.5">
            {BRAND_SUGGESTIONS.map((s) => {
              const selected = validHex && normalizeHex(hex) === s.hex;
              return (
                <button
                  key={s.hex}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${s.name} ${s.hex}`}
                  title={s.name}
                  onClick={() => setHex(s.hex)}
                  className="flex size-11 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-shadow aria-checked:ring-2 aria-checked:ring-foreground"
                  style={{ backgroundColor: s.hex }}
                >
                  {selected ? <Check className="size-5 text-white" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-1.5 sm:max-w-56">
            <Label htmlFor="onb-color-hex">Outra cor (hex)</Label>
            <Input
              id="onb-color-hex"
              value={hex}
              onChange={(e) => onHexChange(e.target.value)}
              placeholder="#3E07D2"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={7}
              className="h-11 font-mono uppercase tabular-nums"
              aria-invalid={!validHex || errors.color ? true : undefined}
              aria-describedby="onb-color-msg"
            />
            <p
              id="onb-color-msg"
              className={`text-[0.8125rem] leading-snug ${!validHex || errors.color ? "text-danger" : "text-ink-muted"}`}
            >
              {!validHex
                ? "Informe uma cor no formato #RRGGBB."
                : (errors.color ?? "Exemplo: #3E07D2")}
            </p>
          </div>
          {adjusted ? (
            <p
              role="status"
              className="flex items-center gap-2 rounded-field bg-canvas px-3 py-2.5 text-[0.8125rem] leading-snug text-ink-muted"
            >
              <span
                className="size-4 shrink-0 rounded-full border border-line"
                style={{ backgroundColor: usedColor }}
                aria-hidden="true"
              />
              <span>
                <strong className="font-semibold text-foreground">
                  Ajustamos a cor para manter a leitura
                </strong>{" "}
                ({usedColor}).
              </span>
            </p>
          ) : null}
        </div>

        <TextField
          name="whatsapp"
          label="WhatsApp"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="(11) 99999-9999"
          className="h-11"
          value={whatsapp}
          onChange={(e) => setWhatsapp(formatBrazilPhone(e.target.value))}
          error={errors.whatsapp}
        />
        <TextField
          name="address"
          label="Endereço (opcional)"
          autoComplete="street-address"
          placeholder="Rua, número e bairro"
          className="h-11"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          error={errors.address}
        />
      </div>
    </StepCard>
  );
}
