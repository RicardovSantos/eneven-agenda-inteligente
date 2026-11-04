"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const INTERVAL_MS = 2000;
/** Quanto a roda do mouse anda a mais que o normal sobre a equipe. */
const WHEEL_BOOST = 2.2;

/**
 * Fileira horizontal da equipe, sem barra de rolagem:
 * - anda sozinha, um cartão a cada 2 s, e volta ao início no fim;
 * - para com o mouse em cima ou o dedo tocando;
 * - com o mouse em cima, a roda rola os cartões de lado (mais rápido); nas pontas a roda
 *   volta a rolar a página;
 * - no celular, arrastar com o dedo rola normalmente.
 */
export function TeamCarousel({ children }: { children: ReactNode }) {
  const track = useRef<HTMLUListElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setInterval(() => {
      if (paused || el.scrollWidth <= el.clientWidth + 1) return;
      const first = el.firstElementChild as HTMLElement | null;
      const step = first ? first.offsetWidth + 12 : el.clientWidth / 2;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
      el.scrollTo({ left: atEnd ? 0 : el.scrollLeft + step, behavior: reduced ? "auto" : "smooth" });
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [paused]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth + 1) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (delta === 0) return;
      const max = el.scrollWidth - el.clientWidth;
      const canMove = delta > 0 ? el.scrollLeft < max - 1 : el.scrollLeft > 1;
      if (!canMove) return; // nas pontas a página volta a rolar
      event.preventDefault();
      el.scrollBy({ left: delta * WHEEL_BOOST, behavior: "auto" });
    };
    // Precisa ser "não passivo" para poder segurar a rolagem da página.
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <ul
      ref={track}
      aria-label="Equipe"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      className="-mx-5 m-0 flex list-none snap-x snap-proximity scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </ul>
  );
}
