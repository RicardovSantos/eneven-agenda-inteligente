"use client";

import { Check, ImagePlus, Loader2 } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import {
  removeLogoAction,
  saveBrandColorAction,
  uploadLogoAction,
  type SettingsFormState,
} from "@/app/painel/configuracoes/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast, useToastOnResult } from "@/components/ui/toast";
import { ensureReadableBrandColor, isHexColor, normalizeHex } from "@/lib/color";
import { initialOf } from "@/lib/initial";
import { SaveRow, SettingsSection } from "./settings-section";

const LOGO_MAX_BYTES = 1024 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Sugestões do sistema visual (todas com contraste AA com texto branco). */
export const BRAND_SUGGESTIONS: Array<{ hex: string; name: string }> = [
  { hex: "#3E07D2", name: "Violeta" },
  { hex: "#0E7C86", name: "Turquesa" },
  { hex: "#B4237A", name: "Magenta" },
  { hex: "#2F6FDB", name: "Azul" },
  { hex: "#8A5A00", name: "Âmbar" },
  { hex: "#4C7A12", name: "Verde" },
  { hex: "#A23B3B", name: "Vinho" },
  { hex: "#5B4BC4", name: "Índigo" },
];

export function BrandAvatar({
  color,
  name,
  logoUrl,
  size,
  busy,
}: {
  color: string;
  name: string;
  logoUrl: string | null;
  size: number;
  busy?: boolean;
}) {
  return (
    <div
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-display font-semibold text-white"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo já vem em 256 px da rota própria
        <img src={logoUrl} alt="" className="size-full object-cover" />
      ) : (
        initialOf(name)
      )}
      {busy ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/45">
          <Loader2 className="size-5 animate-spin text-white" />
        </span>
      ) : null}
    </div>
  );
}

export type BrandInitial = {
  name: string;
  logoUrl: string | null;
  color: string;
};

export function BrandForm({ initial }: { initial: BrandInitial }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadFormRef = useRef<HTMLFormElement>(null);

  const [uploadState, uploadAction, uploading] = useActionState<SettingsFormState, FormData>(
    uploadLogoAction,
    {},
  );
  const [removeState, removeAction, removing] = useActionState<SettingsFormState, FormData>(
    removeLogoAction as (s: SettingsFormState, f: FormData) => Promise<SettingsFormState>,
    {},
  );
  const [colorState, colorAction, savingColor] = useActionState<SettingsFormState, FormData>(
    saveBrandColorAction,
    {},
  );
  useToastOnResult(uploadState);
  useToastOnResult(removeState);
  useToastOnResult(colorState);

  const [pickError, setPickError] = useState<string | null>(null);
  const [hex, setHex] = useState(initial.color.toUpperCase());

  const valid = isHexColor(hex);
  const { color: usedColor, adjusted } = ensureReadableBrandColor(
    valid ? hex : initial.color,
  );
  const logoUrl = initial.logoUrl;
  const logoError = pickError ?? uploadState.fieldErrors?.logo;

  const onPickFile = (file: File | undefined) => {
    setPickError(null);
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      setPickError("Envie uma imagem PNG, JPG ou WebP.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setPickError("A imagem pode ter no máximo 1 MB.");
      if (fileRef.current) fileRef.current.value = "";
      toast.show("A imagem pode ter no máximo 1 MB.", "error");
      return;
    }
    uploadFormRef.current?.requestSubmit();
    // O arquivo já entrou no FormData: limpar permite escolher o mesmo de novo.
    setTimeout(() => {
      if (fileRef.current) fileRef.current.value = "";
    }, 0);
  };

  const onHexChange = (value: string) => {
    let next = value.trim().toUpperCase();
    if (next && !next.startsWith("#")) next = `#${next}`;
    setHex(next.slice(0, 7));
  };

  return (
    <SettingsSection
      id="brand"
      title="Marca"
      description="O logo e a cor aparecem na sua página de agendamento."
    >
      <div className="flex flex-col gap-6">
        {/* Logo */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium leading-snug">Logo</p>
          <div className="flex flex-wrap items-center gap-4">
            <BrandAvatar
              color={usedColor}
              name={initial.name}
              logoUrl={logoUrl}
              size={72}
              busy={uploading || removing}
            />
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <form ref={uploadFormRef} action={uploadAction}>
                  <input
                    ref={fileRef}
                    id="logo"
                    name="logo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    tabIndex={-1}
                    onChange={(e) => onPickFile(e.target.files?.[0])}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={uploading || removing}
                    onClick={() => fileRef.current?.click()}
                  >
                    <ImagePlus aria-hidden="true" />
                    {logoUrl ? "Trocar logo" : "Enviar logo"}
                  </Button>
                </form>
                {logoUrl ? (
                  <form action={removeAction}>
                    <Button
                      type="submit"
                      variant="ghost"
                      disabled={uploading || removing}
                      className="text-danger hover:text-danger"
                    >
                      Remover
                    </Button>
                  </form>
                ) : null}
              </div>
              <p className="text-[0.8125rem] leading-snug text-ink-muted">
                PNG, JPG ou WebP, até 1 MB. Fica redondo na sua página.
              </p>
            </div>
          </div>
          {logoError ? (
            <p role="alert" className="text-[0.8125rem] leading-snug text-danger">
              {logoError}
            </p>
          ) : null}
          {removeState.error || uploadState.error ? (
            <p role="alert" className="text-[0.8125rem] leading-snug text-danger">
              {uploadState.error ?? removeState.error}
            </p>
          ) : null}
        </div>

        {/* Cor */}
        <form action={colorAction} noValidate className="flex flex-col gap-5">
          <input type="hidden" name="color" value={hex} />
          <div className="flex flex-col gap-3">
            <p id="brand-color-label" className="text-sm font-medium leading-snug">
              Cor da marca
            </p>
            <div role="radiogroup" aria-labelledby="brand-color-label" className="flex flex-wrap gap-2.5">
              {BRAND_SUGGESTIONS.map((s) => {
                const selected = valid && normalizeHex(hex) === s.hex;
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
              <Label htmlFor="color-hex">Outra cor (hex)</Label>
              <Input
                id="color-hex"
                value={hex}
                onChange={(e) => onHexChange(e.target.value)}
                placeholder="#3E07D2"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={7}
                className="h-11 font-mono uppercase tabular-nums"
                aria-invalid={!valid || colorState.fieldErrors?.color ? true : undefined}
                aria-describedby="color-hex-msg"
              />
              <p
                id="color-hex-msg"
                className={`text-[0.8125rem] leading-snug ${!valid || colorState.fieldErrors?.color ? "text-danger" : "text-ink-muted"}`}
              >
                {!valid
                  ? "Informe uma cor no formato #RRGGBB."
                  : (colorState.fieldErrors?.color ?? "Exemplo: #3E07D2")}
              </p>
            </div>
          </div>

          {/* Prévia ao vivo */}
          <div className="flex flex-col gap-3 rounded-panel border border-line bg-canvas p-4">
            <p className="text-[0.8125rem] font-semibold text-ink-muted">
              Prévia da sua página
            </p>
            <div className="flex items-center gap-3 rounded-field border border-line bg-surface px-3 py-2.5">
              <BrandAvatar color={usedColor} name={initial.name} logoUrl={logoUrl} size={40} />
              <div className="min-w-0 leading-tight">
                <p className="truncate font-display font-semibold">{initial.name}</p>
                <p className="text-[0.8125rem] text-ink-muted">Agende seu horário</p>
              </div>
            </div>
            <div
              aria-hidden="true"
              className="flex h-12 items-center justify-center rounded-field text-base font-semibold text-white"
              style={{ backgroundColor: usedColor }}
            >
              Continuar
            </div>
            {adjusted ? (
              <p
                role="status"
                className="flex items-center gap-2 text-[0.8125rem] leading-snug text-ink-muted"
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

          <SaveRow pending={savingColor} disabled={!valid} error={colorState.error} />
        </form>
      </div>
    </SettingsSection>
  );
}
