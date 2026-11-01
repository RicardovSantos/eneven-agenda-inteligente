import { isSandboxAccessToken } from "./sandbox";

/** Credenciais e retorno vêm exclusivamente do servidor. */
export function testBillingConfig() {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const collectorId = process.env.MERCADO_PAGO_COLLECTOR_ID;
  const appUrl = process.env.APP_URL;
  if (process.env.NODE_ENV === "production" || process.env.MERCADO_PAGO_LIVE_MODE !== "false" || !isSandboxAccessToken(accessToken) || !collectorId || !appUrl) return null;
  try {
    const base = new URL(appUrl);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) return null;
    return { accessToken, collectorId, backUrl: new URL("/painel/configuracoes/assinatura", base).href };
  } catch { return null; }
}
