"use client";

import { ImagePlus, Loader2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SafeImage } from "@/components/media/safe-image";
import { ImageConvertError, convertImageFile } from "@/lib/image-to-webp";
import { cn } from "@/lib/utils";

export type PhotoResult = { ok: boolean; error?: string };

/**
 * Escolha de uma foto no painel: a imagem escolhida (qualquer formato) é
 * convertida para WebP no navegador e enviada; a prévia mostra a foto atual
 * com a barra de carregamento. Quem usa decide o que "enviar" e "remover" fazem.
 */
export function PhotoField({
  label,
  hint,
  currentUrl,
  shape,
  maxSide,
  placeholder,
  onUpload,
  onRemove,
  disabled,
}: {
  label: string;
  hint?: string;
  currentUrl: string | null;
  shape: "wide" | "round";
  /** Maior lado da imagem enviada, em pixels. */
  maxSide: number;
  /** Mostrado no quadro quando não há foto. */
  placeholder: ReactNode;
  onUpload: (file: File) => Promise<PhotoResult>;
  onRemove?: () => Promise<PhotoResult>;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"convert" | "send" | "remove" | null>(null);
  // Avanço da barra de envio: preparando (convertendo) 35%, enviando 75%, pronto 100%.
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file) return;
    setError(null);
    try {
      setBusy("convert");
      setProgress(35);
      const webp = await convertImageFile(file, { maxSide });
      setBusy("send");
      setProgress(75);
      const result = await onUpload(webp);
      setProgress(100);
      if (!result.ok) setError(result.error ?? "Não foi possível enviar a imagem.");
    } catch (e) {
      setError(e instanceof ImageConvertError ? e.message : "Não foi possível enviar a imagem.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!onRemove) return;
    setError(null);
    setBusy("remove");
    try {
      const result = await onRemove();
      if (!result.ok) setError(result.error ?? "Não foi possível remover a imagem.");
    } finally {
      setBusy(null);
    }
  }

  const frame = cn(
    "relative shrink-0 overflow-hidden border border-line bg-canvas",
    shape === "wide" ? "aspect-[380/218] w-full rounded-field" : "size-24 rounded-full",
  );

  return (
    <div className={cn("flex gap-4", shape === "wide" ? "flex-col" : "flex-row items-center")}>
      <div className={frame}>
        {currentUrl ? (
          <SafeImage
            key={currentUrl}
            src={currentUrl}
            alt={label}
            className="size-full"
            fallback={placeholder}
          />
        ) : (
          <div className="grid size-full place-items-center text-ink-muted">{placeholder}</div>
        )}
        {busy ? (
          <div
            role="progressbar"
            aria-label={
              busy === "convert" ? "Convertendo a imagem" : busy === "send" ? "Enviando a imagem" : "Removendo a imagem"
            }
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={busy === "remove" ? undefined : progress}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 px-4 text-white"
          >
            <span className="flex items-center gap-2 text-[0.8125rem] font-medium">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {busy === "convert" ? "Convertendo…" : busy === "send" ? "Enviando…" : "Removendo…"}
            </span>
            {busy === "remove" ? null : (
              <span className="h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-white/25">
                <span
                  className="block h-full rounded-full bg-white transition-[width] duration-300"
                  style={{ width: `${progress}%` }}
                />
              </span>
            )}
          </div>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-medium leading-snug">{label}</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-label={label}
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || busy !== null}
            onClick={() => input.current?.click()}
          >
            <ImagePlus aria-hidden="true" />
            {currentUrl ? "Trocar" : "Enviar"}
          </Button>
          {currentUrl && onRemove ? (
            <Button
              type="button"
              variant="ghost"
              disabled={disabled || busy !== null}
              onClick={() => void remove()}
              className="text-danger hover:text-danger"
            >
              Remover
            </Button>
          ) : null}
        </div>
        {hint ? <p className="text-[0.8125rem] leading-snug text-ink-muted">{hint}</p> : null}
        {error ? (
          <p role="alert" className="text-[0.8125rem] leading-snug text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
