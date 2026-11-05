import { isSandboxAccessToken } from "./sandbox";
import { stripeLiveEnabled } from "./stripe/config";

type Env = Record<string, string | undefined>;

export type BillingConfig = {
  accessToken: string;
  collectorId: string;
  /** Endereço de retorno do checkout, sempre montado no servidor. */
  backUrl: string;
  /** `true`: cobrança real (produção); `false`: sandbox da Mercado Pago. */
  live: boolean;
};

/**
 * A cobrança real só liga em produção, com o interruptor `MERCADO_PAGO_LIVE_MODE=true`,
 * um token `APP_USR-` e o ID numérico do vendedor. O sandbox (`MERCADO_PAGO_SANDBOX=true`)
 * nunca convive com ela, para um token de teste não passar por real nem o contrário.
 */
export function liveBillingEnabled(env: Env = process.env): boolean {
  return (
    env.NODE_ENV === "production" &&
    env.MERCADO_PAGO_LIVE_MODE === "true" &&
    env.MERCADO_PAGO_SANDBOX !== "true" &&
    Boolean(env.MERCADO_PAGO_ACCESS_TOKEN?.startsWith("APP_USR-")) &&
    /^\d{1,20}$/.test(env.MERCADO_PAGO_COLLECTOR_ID ?? "")
  );
}

/** Endereço de retorno da página de assinatura, a partir de `APP_URL` (https, sem credenciais nem parâmetros). */
function backUrlFrom(appUrl: string | undefined): string | null {
  if (!appUrl) return null;
  try {
    const base = new URL(appUrl);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) return null;
    return new URL("/painel/configuracoes/assinatura", base).href;
  } catch {
    return null;
  }
}

/** Endereço de retorno do checkout (a tela de assinatura), montado no servidor a partir de `APP_URL`; `null` se inválido. */
export function billingReturnUrl(env: Env = process.env): string | null {
  return backUrlFrom(env.APP_URL);
}

/** Configuração ativa da cobrança (real ou sandbox) ou `null` se nada está configurado. */
export function billingConfig(env: Env = process.env): BillingConfig | null {
  const backUrl = backUrlFrom(env.APP_URL);
  if (!backUrl) return null;
  if (liveBillingEnabled(env)) {
    return { accessToken: env.MERCADO_PAGO_ACCESS_TOKEN!, collectorId: env.MERCADO_PAGO_COLLECTOR_ID!, backUrl, live: true };
  }
  const accessToken = env.MERCADO_PAGO_ACCESS_TOKEN;
  const collectorId = env.MERCADO_PAGO_COLLECTOR_ID;
  if (env.NODE_ENV === "production" || env.MERCADO_PAGO_LIVE_MODE !== "false" || !isSandboxAccessToken(accessToken, env) || !collectorId) return null;
  return { accessToken, collectorId, backUrl, live: false };
}

/** Recusa credencial que não combina com o modo (real em produção, teste fora dela). */
export function assertBillingConfig(config: { accessToken: string; live?: boolean }, env: Env = process.env): void {
  if (config.live) {
    if (!liveBillingEnabled(env) || config.accessToken !== env.MERCADO_PAGO_ACCESS_TOKEN) throw new Error("Cobrança real não configurada.");
    return;
  }
  if (env.NODE_ENV === "production" || !isSandboxAccessToken(config.accessToken, env)) throw new Error("Cobrança de teste não configurada.");
}

/** Pode alterar o acesso dos estabelecimentos? Só no modo real em produção ou no sandbox fora dela. */
export function billingAccessEnabled(config: { accessToken: string; liveMode: boolean }, env: Env = process.env): boolean {
  if (config.liveMode) return liveBillingEnabled(env) && config.accessToken === env.MERCADO_PAGO_ACCESS_TOKEN;
  return env.NODE_ENV !== "production" && isSandboxAccessToken(config.accessToken, env);
}

/** Algum provedor está com a cobrança real ligada em produção (Mercado Pago ou Stripe). */
export function anyLiveBillingEnabled(env: Env = process.env): boolean {
  return liveBillingEnabled(env) || stripeLiveEnabled(env);
}
