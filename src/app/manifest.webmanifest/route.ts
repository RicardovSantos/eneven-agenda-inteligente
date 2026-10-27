import { buildManifest } from "@/lib/pwa-manifest";

export const dynamic = "force-static";

/** Manifest do PWA (painel). O link só é incluído nas telas do painel e de autenticação. */
export function GET() {
  return new Response(JSON.stringify(buildManifest()), {
    headers: { "content-type": "application/manifest+json; charset=utf-8" },
  });
}
