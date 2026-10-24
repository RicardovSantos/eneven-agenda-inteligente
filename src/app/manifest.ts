import type { MetadataRoute } from "next";
import { PRODUCT_NAME, PRODUCT_SHORT_NAME } from "@/lib/brand";

/** Manifest do PWA, servido em `/manifest.webmanifest`. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUCT_NAME,
    short_name: PRODUCT_SHORT_NAME,
    description: "Agenda online para salões, estúdios e clínicas de estética.",
    start_url: "/painel",
    scope: "/",
    display: "standalone",
    lang: "pt-BR",
    theme_color: "#3E07D2",
    background_color: "#FFFFFF",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/brand/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Agenda de hoje",
        url: "/painel?view=dia",
        icons: [{ src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Novo agendamento",
        url: "/painel?novo=1",
        icons: [{ src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
