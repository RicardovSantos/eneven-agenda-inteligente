"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Imagem comum de uma foto enviada pelo estabelecimento, com um plano B se o
 * arquivo não carregar (sem barra de progresso: ela só existe no envio).
 */
export function SafeImage({
  src,
  alt,
  className,
  fallback,
  priority,
}: {
  src: string;
  /** Vazio quando a foto é decorativa (o nome já está no texto ao lado). */
  alt: string;
  className?: string;
  /** Mostrado se a imagem não carregar. */
  fallback?: ReactNode;
  /** Primeira imagem da tela: carrega já, sem esperar rolar. */
  priority?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) {
    return <div className={cn("grid place-items-center bg-canvas", className)}>{fallback}</div>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- WebP já otimizado no envio, servido por /api/midia com cache longo
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={cn("bg-canvas object-cover", className)}
    />
  );
}
