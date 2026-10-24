import type { Metadata, Viewport } from "next";
import { PRODUCT_NAME, PRODUCT_SHORT_NAME } from "@/lib/brand";
import { appUrl } from "@/server/email/templates";

/** Cor da marca: barra do navegador e splash do app instalado. */
export const THEME_COLOR = "#3E07D2";

const DESCRIPTION = "Agenda online para salões, estúdios e clínicas de estética.";

/**
 * Metadados do layout raiz. Ficam fora do `layout.tsx` (que carrega
 * `next/font`) para os testes poderem importá-los no Vitest.
 */
export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: {
    default: PRODUCT_NAME,
    template: `%s · ${PRODUCT_SHORT_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: PRODUCT_NAME,
  icons: {
    icon: [
      { url: "/brand/favicon.ico", sizes: "any" },
      { url: "/brand/icon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: PRODUCT_SHORT_NAME,
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: PRODUCT_NAME,
    title: PRODUCT_NAME,
    description: DESCRIPTION,
    images: [
      {
        url: "/brand/og-default.png",
        width: 1200,
        height: 630,
        alt: PRODUCT_NAME,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: PRODUCT_NAME,
    description: DESCRIPTION,
    images: ["/brand/og-default.png"],
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: THEME_COLOR,
};
