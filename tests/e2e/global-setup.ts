import type { FullConfig } from "@playwright/test";

/**
 * Em desenvolvimento cada rota compila na primeira visita (segundos). Visita
 * as rotas mais usadas antes dos testes para que nenhum teste pague por isso.
 */
export default async function globalSetup(config: FullConfig) {
  const base = config.projects[0].use.baseURL!;
  const secret = process.env.E2E_SEED ?? "e2e-local-secret";
  const seeded = await fetch(`${base}/api/e2e/seed`, {
    method: "POST",
    headers: { "x-e2e-seed": secret, "content-type": "application/json" },
    body: JSON.stringify({ action: "tenant", name: "Aquecimento" }),
  });
  if (!seeded.ok) throw new Error(`Falha ao criar estabelecimento de aquecimento: ${seeded.status}`);
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

  const sessionResponse = await fetch(`${base}/api/e2e/seed`, {
    method: "POST",
    headers: { "x-e2e-seed": secret, "content-type": "application/json" },
    body: JSON.stringify({ action: "session", slug }),
  });
  if (!sessionResponse.ok) throw new Error(`Falha ao criar sessão de aquecimento: ${sessionResponse.status}`);
  const session = (await sessionResponse.json()) as { cookieName: string; token: string };
  for (const path of [
    "/painel",
    "/painel/clientes",
    "/painel/clientes/00000000-0000-4000-8000-000000000000",
    "/painel/visao-geral",
  ]) {
    await fetch(`${base}${path}`, { headers: { cookie: `${session.cookieName}=${session.token}` } }).then((r) => r.arrayBuffer());
  }
  await fetch(`${base}/convite/aquecimento`).then((r) => r.arrayBuffer());
  const adminResponse = await fetch(`${base}/api/e2e/seed`, {
    method: "POST",
    headers: { "x-e2e-seed": secret, "content-type": "application/json" },
    body: JSON.stringify({ action: "super-admin" }),
  });
  if (!adminResponse.ok) throw new Error(`Falha ao criar administrador de aquecimento: ${adminResponse.status}`);
  const admin = (await adminResponse.json()) as { cookieName: string; token: string };
  for (const path of ["/admin", "/admin/planos", "/admin/estabelecimentos/novo"]) {
    await fetch(`${base}${path}`, { headers: { cookie: `${admin.cookieName}=${admin.token}` } }).then((r) => r.arrayBuffer());
  }
}
