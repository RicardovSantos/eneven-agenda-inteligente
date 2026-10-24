/*
 * Service worker do Eneven Agenda.
 *
 * Regras (o agendamento precisa de internet e os dados são de cada salão):
 * - Cache só do que é estático e público: /offline.html e os ícones da marca.
 * - Navegações vão sempre à rede; sem conexão, mostram /offline.html. Nenhuma
 *   página (HTML) entra no cache, para nunca guardar telas autenticadas.
 * - /api/*, Server Actions e qualquer requisição que não seja GET passam direto,
 *   sem o service worker tocar nelas.
 *
 * MODELO: `public/sw.js` é gerado por `pnpm brand` (predev e prebuild) a partir
 * deste arquivo. O marcador de CACHE_VERSION vira um hash curto dos arquivos de
 * public/brand/, então trocar a logo (ou qualquer ícone) muda o CACHE_VERSION sozinho e os
 * navegadores baixam tudo de novo. Não edite public/sw.js (não vai para o Git).
 */
const CACHE_VERSION = "__BRAND_HASH__";
const CACHE_NAME = `eneven-agenda-${CACHE_VERSION}`;

const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_URL,
  // Logo leve (320 px) da página offline; as logos grandes não entram no cache.
  "/brand/logo-email.png",
  "/brand/icon-192.png",
  "/brand/icon-512.png",
  "/brand/icon-maskable-512.png",
  "/brand/apple-touch-icon.png",
  "/brand/favicon.ico",
  "/brand/icon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("eneven-agenda-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Server Actions e formulários são POST: nunca interceptar.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API e rotas dinâmicas de autenticação: sempre direto na rede.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return cached ?? new Response("Sem conexão", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }),
    );
    return;
  }

  // Ícones e logos da marca: cache primeiro (são pré-cacheados e imutáveis por versão).
  if (url.pathname.startsWith("/brand/")) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request)),
    );
  }
  // Todo o resto (JS, CSS, imagens, payloads RSC) segue o caminho normal do navegador.
});
