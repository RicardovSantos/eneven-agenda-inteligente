import type { StoredPhoto } from "./photos";

/**
 * Resposta das rotas de imagem: o endereço leva `?v=` (versão), então pode
 * ficar em cache por um ano; a troca da foto muda o endereço.
 */
export function imageResponse(photo: StoredPhoto | null): Response {
  if (!photo) return new Response("Not found", { status: 404 });
  const body = new Uint8Array(photo.data);
  return new Response(body, {
    headers: {
      "Content-Type": photo.mime,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
