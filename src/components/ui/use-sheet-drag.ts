import { useRef, type PointerEvent as ReactPointerEvent } from "react";

const CLOSE_DISTANCE = 100;
const FLICK_DISTANCE = 40;
const FLICK_SPEED = 0.5; // px por ms
const ANIM_MS = 180;

/**
 * Arrastar a folha inferior (celular) para baixo pelo "traço" do topo: a folha acompanha o dedo,
 * fecha se for puxada o bastante (ou rápido) e volta ao lugar se for solta antes. Só mexe no
 * `transform` do elemento direto (sem re-render a cada movimento). Os props vão no traço.
 */
export function useSheetDrag(getSheet: () => HTMLElement | null, onClose: () => void) {
  const drag = useRef<{ y: number; t: number; pointer: number } | null>(null);

  const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function settle(sheet: HTMLElement, to: string, done?: () => void) {
    if (reduced()) {
      sheet.style.transform = to;
      done?.();
      return;
    }
    sheet.style.transition = `transform ${ANIM_MS}ms ease-out`;
    sheet.style.transform = to;
    window.setTimeout(() => {
      sheet.style.transition = "";
      done?.();
    }, ANIM_MS);
  }

  return {
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const sheet = getSheet();
      if (!sheet) return;
      drag.current = { y: event.clientY, t: event.timeStamp, pointer: event.pointerId };
      event.currentTarget.setPointerCapture(event.pointerId);
      sheet.style.transition = "none";
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const state = drag.current;
      const sheet = getSheet();
      if (!state || !sheet || state.pointer !== event.pointerId) return;
      sheet.style.transform = `translateY(${Math.max(0, event.clientY - state.y)}px)`;
    },
    onPointerUp(event: ReactPointerEvent<HTMLElement>) {
      const state = drag.current;
      const sheet = getSheet();
      drag.current = null;
      if (!state || !sheet || state.pointer !== event.pointerId) return;
      const distance = Math.max(0, event.clientY - state.y);
      const speed = distance / Math.max(1, event.timeStamp - state.t);
      if (distance >= CLOSE_DISTANCE || (distance >= FLICK_DISTANCE && speed >= FLICK_SPEED)) {
        settle(sheet, "translateY(100%)", onClose);
      } else {
        settle(sheet, "");
      }
    },
    onPointerCancel() {
      const sheet = getSheet();
      drag.current = null;
      if (sheet) settle(sheet, "");
    },
  };
}

/** Classes do traço: área de toque generosa, sem rolar a página enquanto arrasta. */
export const SHEET_HANDLE_CLASS = "-mt-2.5 flex min-h-9 cursor-grab touch-none items-center justify-center self-stretch active:cursor-grabbing lg:hidden";
