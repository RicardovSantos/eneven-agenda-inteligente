"use client";

import { useEffect } from "react";

/** Registra o service worker (`/sw.js`) só em produção: em dev ele atrapalharia o hot reload. */
export function RegisterSw() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Sem service worker o app funciona igual, só não abre a página offline.
    });
  }, []);

  return null;
}
