import type { NextConfig } from "next";

/**
 * Cabeçalhos de segurança de todas as rotas. HSTS só em produção (em
 * localhost o navegador guardaria a regra de HTTPS para o domínio todo).
 * Avaliado a cada chamada de `headers()` para o teste poder trocar o ambiente.
 */
function securityHeaders(): { key: string; value: string }[] {
  const headers = [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];
  if (process.env.NODE_ENV === "production") {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  }
  return headers;
}

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // PGlite carrega arquivos .wasm/.data relativos ao próprio pacote.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Envio do logo (até 1 MB) por ação do servidor: o padrão de 1 MB não cobre o corpo multipart.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
  async rewrites() {
    // Navegadores pedem /favicon.ico direto: serve o ícone gerado a partir da logo.
    return [{ source: "/favicon.ico", destination: "/brand/favicon.ico" }];
  },
};

export default nextConfig;
