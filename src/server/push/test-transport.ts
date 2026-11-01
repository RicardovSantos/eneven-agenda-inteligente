import { lookup } from "node:dns/promises";
import { request } from "node:https";
import ipaddr from "ipaddr.js";
import { generateRequestDetails } from "web-push";
import { pushAvailable } from "./mode";
import { validatePushSubscription } from "./validate-subscription";

type Address = { address: string; family: number };
type Vapid = { subject: string; publicKey: string; privateKey: string };
type PushType = "booking_created" | "booking_canceled" | "booking_rescheduled";

/** Os provedores permitidos são fixos; subdomínios arbitrários de outros domínios não passam. */
export function assertAllowedPushEndpoint(endpoint: string): URL {
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new Error("Destino de notificações não permitido."); }
  const host = url.hostname;
  const allowed = host === "fcm.googleapis.com" || host === "push.services.mozilla.com" || host === "updates.push.services.mozilla.com" || /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.push\.apple\.com$/.test(host);
  if (!allowed || url.protocol !== "https:" || url.port || url.username || url.password || url.hash || endpoint !== url.href) throw new Error("Destino de notificações não permitido.");
  return url;
}

/** Rejeita toda a resposta DNS se houver algum endereço não público. */
export function selectPublicPushAddress(addresses: Address[]): Address {
  if (!addresses.length || addresses.some(({ address, family }) => {
    if (!ipaddr.isValid(address)) return true;
    const parsed = ipaddr.process(address);
    return parsed.range() !== "unicast" || (family !== 4 && family !== 6) || (parsed.kind() === "ipv4" ? family !== 4 : family !== 6);
  })) throw new Error("Endereço de rede não permitido.");
  return addresses.find(({ family }) => family === 4) ?? addresses[0];
}

/** Envio com destinos fixos e endereço público validado; não recebe payload arbitrário. Em produção só com o envio real ligado. */
export async function sendTestPush(input: unknown, type: PushType, vapid: Vapid): Promise<"sent" | "expired"> {
  if (!pushAvailable()) throw new Error("Envio indisponível em produção.");
  if (!["booking_created", "booking_canceled", "booking_rescheduled"].includes(type)) throw new Error("Evento inválido.");
  const subscription = validatePushSubscription(input);
  const url = assertAllowedPushEndpoint(subscription.endpoint);
  const details = generateRequestDetails({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ type }), { vapidDetails: vapid, TTL: 300 });
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true }),
    new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error("Tempo de DNS esgotado.")), 5000); timer.unref(); }),
  ]);
  const selected = selectPublicPushAddress(addresses);
  return new Promise((resolve, reject) => {
    // Conecta no IP já validado, mantendo SNI e validação TLS para o hostname.
    // https.request não segue redirecionamentos e não usa proxy global.
    const req = request({ hostname: selected.address, family: selected.family, port: 443, servername: url.hostname, method: "POST", path: `${url.pathname}${url.search}`, headers: { ...details.headers, Host: url.host }, agent: false, signal: AbortSignal.timeout(10_000) }, (response) => {
      const status = response.statusCode ?? 0;
      response.resume();
      if (status >= 200 && status < 300) resolve("sent");
      else if (status === 404 || status === 410) resolve("expired");
      else reject(new Error("Serviço de notificações recusou o envio."));
    });
    req.on("error", () => reject(new Error("Falha ao enviar notificação.")));
    req.end(details.body);
  });
}
