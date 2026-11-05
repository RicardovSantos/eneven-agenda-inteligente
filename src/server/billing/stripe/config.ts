type Env = Record<string, string | undefined>;

export type StripeConfig = {
  secretKey: string;
  webhookSecret: string;
  /** `true`: cobrança real (só em produção, chave `sk_live_`); `false`: modo de teste da Stripe. */
  live: boolean;
};

/**
 * Configuração da Stripe, sempre separando teste e real:
 * - em produção, só liga com `STRIPE_LIVE_MODE=true` e chave `sk_live_` (ou restrita `rk_live_`);
 * - fora da produção, só aceita chave de teste (`sk_test_`/`rk_test_`): uma chave real nunca roda em desenvolvimento.
 * Sem o segredo do webhook não liga (não dá para confirmar nenhum aviso). Devolve `null` se algo falta.
 */
export function stripeConfig(env: Env = process.env): StripeConfig | null {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secretKey || !webhookSecret || !webhookSecret.startsWith("whsec_")) return null;
  const isLiveKey = /^(sk|rk)_live_/.test(secretKey);
  const isTestKey = /^(sk|rk)_test_/.test(secretKey);
  if (env.NODE_ENV === "production") {
    if (env.STRIPE_LIVE_MODE === "true") return isLiveKey ? { secretKey, webhookSecret, live: true } : null;
    return isTestKey ? { secretKey, webhookSecret, live: false } : null;
  }
  return isTestKey ? { secretKey, webhookSecret, live: false } : null;
}

/** A cobrança real da Stripe está ligada (produção, chave real e `STRIPE_LIVE_MODE=true`). */
export function stripeLiveEnabled(env: Env = process.env): boolean {
  return env.NODE_ENV === "production" && stripeConfig(env)?.live === true;
}
