import { buildAssetLinks } from "@/lib/assetlinks";

// Lê variáveis de ambiente a cada pedido: nada de resultado fixado no build.
export const dynamic = "force-dynamic";

/** `/.well-known/assetlinks.json`: precisa responder 200 direto (sem redirecionamento) e como JSON. */
export function GET(): Response {
  const links = buildAssetLinks();
  if (!links) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(JSON.stringify(links), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
