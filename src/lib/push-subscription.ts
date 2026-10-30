/** Este módulo não pede permissão ao ser carregado. Chamar apenas após clique explícito. */
function decodePublicKey(key: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]{87}$/.test(key)) throw new Error("Chave pública de notificações inválida.");
  let bytes: string;
  try { bytes = atob(`${key.replace(/-/g, "+").replace(/_/g, "/")}=`); } catch { throw new Error("Chave pública de notificações inválida."); }
  if (bytes.length !== 65 || bytes.charCodeAt(0) !== 4) throw new Error("Chave pública de notificações inválida.");
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

/**
 * O chamador deve salvar a inscrição por uma ação autenticada e isolada por
 * estabelecimento. Uma falha ao salvar mantém a inscrição local para retry.
 */
export async function enablePushForDevice(publicKey: string, save: (subscription: PushSubscriptionJSON) => Promise<void>): Promise<"enabled" | "denied"> {
  const key = decodePublicKey(publicKey);
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Notificações não disponíveis neste dispositivo.");
  // Deve ser chamado diretamente no gesto do usuário (especialmente no iOS).
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration || !registration.active) throw new Error("Aplicativo ainda não está pronto para notificações.");
  let subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const existing = subscription.options.applicationServerKey;
    if (!existing || new Uint8Array(existing).length !== key.length || new Uint8Array(existing).some((byte, index) => byte !== key[index])) throw new Error("A inscrição existente pertence a outra chave de notificações.");
  } else {
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  }
  await save(subscription.toJSON());
  return "enabled";
}
