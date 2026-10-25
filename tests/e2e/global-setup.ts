import type { FullConfig } from "@playwright/test";

/**
 * Em desenvolvimento cada rota compila na primeira visita (segundos). Visita
 * as rotas da página pública antes dos testes para que nenhum teste pague por isso.
 */
export default async function globalSetup(config: FullConfig) {
  const base = config.projects[0].use.baseURL!;
  const secret = process.env.E2E_SEED ?? "e2e-local-secret";
  const seeded = await fetch(`${base}/api/e2e/seed`, {
    method: "POST",
    headers: { "x-e2e-seed": secret, "content-type": "application/json" },
    body: JSON.stringify({ action: "tenant", name: "Aquecimento" }),
  });
  const { slug } = (await seeded.json()) as { slug: string };
  for (const path of [
    `/${slug}`,
    `/${slug}/opengraph-image`,
    "/nao-existe-mesmo",
    "/agendamento/aquecimento",
    "/api/agendamento/aquecimento/ics",
    "/privacidade",
  ]) {
    await fetch(`${base}${path}`).then((r) => r.arrayBuffer());
  }
}
