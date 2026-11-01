"use client";

import { useEffect, useRef, useState } from "react";
import { SafeImage } from "@/components/media/safe-image";
import { cn } from "@/lib/utils";

export const DEFAULT_HERO_TITLE = "Seu cuidado começa aqui";
export const DEFAULT_HERO_SUBTITLE = "Escolha o serviço e agende em poucos passos";

const INTERVAL_MS = 5000;

/**
 * Carrossel da página pública: as imagens rolam sozinhas (e também no toque,
 * com encaixe) e os pontos mostram a posição. Pausa enquanto a pessoa toca,
 * passa o mouse ou foca nele, e não roda sozinho para quem pediu menos movimento.
 */
export function HeroCarousel({
  images,
  title,
  subtitle,
}: {
  images: string[];
  title: string;
  subtitle: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = images.length;

  const scrollTo = (next: number, smooth = true) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: next * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
  };

  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      const el = track.current;
      if (!el) return;
      const current = Math.round(el.scrollLeft / el.clientWidth);
      el.scrollTo({ left: ((current + 1) % count) * el.clientWidth, behavior: "smooth" });
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [count, paused]);

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Fotos do estabelecimento"
      className="flex flex-col gap-2.5 px-5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      <div className="relative overflow-hidden rounded-[22px] bg-canvas">
        <div
          ref={track}
          onScroll={(event) => {
            const el = event.currentTarget;
            setIndex(Math.round(el.scrollLeft / el.clientWidth));
          }}
          className="flex aspect-[380/218] snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {images.map((src, i) => (
            <div
              key={src}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} de ${count}`}
              className="size-full shrink-0 snap-center"
            >
              <SafeImage src={src} alt="" priority={i === 0} className="size-full" />
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/80 via-black/55 to-transparent px-5 pt-10 pb-4 text-white">
          <h2 className="m-0 font-display text-[19px] leading-tight font-semibold">{title}</h2>
          <p className="m-0 text-[13px] leading-snug text-white/85">{subtitle}</p>
        </div>
      </div>
      {count > 1 ? (
        <div className="flex items-center justify-center">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              aria-label={`Ver imagem ${i + 1}`}
              aria-current={i === index ? "true" : undefined}
              onClick={() => scrollTo(i)}
              className="group grid h-6 min-w-6 place-items-center px-0.5"
            >
              <span
                className={cn(
                  "h-[5px] rounded-full transition-all",
                  i === index ? "w-[18px] bg-(--brand)" : "w-[5px] bg-ink-muted/40",
                )}
              />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
