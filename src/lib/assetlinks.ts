/**
 * Digital Asset Links: prova ao Android que o app da Play é dono deste site (é o que faz a TWA abrir
 * em tela cheia, sem barra do navegador). Valores vêm de variáveis de ambiente, lidas na hora:
 *   ANDROID_APP_PACKAGE            nome do pacote (ex.: br.com.eneven.agenda)
 *   ANDROID_APP_SHA256_FINGERPRINTS  impressões digitais SHA-256 do certificado, separadas por vírgula.
 * Com Play App Signing, use a impressão da "chave de assinatura do app" (Play Console > Integridade
 * do app); inclua também a da chave de upload se for testar um APK assinado por ela.
 */
const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export type AssetLink = {
  relation: string[];
  target: { namespace: "android_app"; package_name: string; sha256_cert_fingerprints: string[] };
};

/** `null` quando falta variável ou algum valor é inválido: melhor 404 do que um arquivo que não prova nada. */
export function buildAssetLinks(env: Record<string, string | undefined> = process.env): AssetLink[] | null {
  const packageName = env.ANDROID_APP_PACKAGE?.trim() ?? "";
  const fingerprints = (env.ANDROID_APP_SHA256_FINGERPRINTS ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  if (!PACKAGE.test(packageName) || fingerprints.length === 0 || !fingerprints.every((value) => FINGERPRINT.test(value))) return null;
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: [...new Set(fingerprints)] },
    },
  ];
}
