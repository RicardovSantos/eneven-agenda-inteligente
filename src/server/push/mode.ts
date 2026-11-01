type Env = Record<string, string | undefined>;

/**
 * O envio real de notificações só liga em produção com o interruptor
 * `PUSH_ENABLED=true` e as três variáveis VAPID. Sem isso nada é registrado nem
 * enviado em produção (o modo de teste continua só fora dela).
 */
export function livePushEnabled(env: Env = process.env): boolean {
  return (
    env.NODE_ENV === "production" &&
    env.PUSH_ENABLED === "true" &&
    Boolean(env.PUSH_VAPID_PUBLIC_KEY && env.PUSH_VAPID_PRIVATE_KEY && /^(mailto:|https:\/\/)/.test(env.PUSH_VAPID_SUBJECT ?? ""))
  );
}

/** Em produção só com o envio real ligado; fora dela sempre (teste e desenvolvimento). */
export function pushAvailable(env: Env = process.env): boolean {
  return env.NODE_ENV !== "production" || livePushEnabled(env);
}

/** Chaves VAPID do ambiente, ou `null` se faltar alguma. */
export function pushVapid(env: Env = process.env): { subject: string; publicKey: string; privateKey: string } | null {
  const { PUSH_VAPID_PUBLIC_KEY: publicKey, PUSH_VAPID_PRIVATE_KEY: privateKey, PUSH_VAPID_SUBJECT: subject } = env;
  return publicKey && privateKey && subject ? { subject, publicKey, privateKey } : null;
}
