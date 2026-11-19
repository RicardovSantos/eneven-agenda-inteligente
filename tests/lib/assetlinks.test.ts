import { describe, expect, it } from "vitest";
import { buildAssetLinks } from "@/lib/assetlinks";

const FP = Array.from({ length: 32 }, (_, i) => (i * 7 + 3).toString(16).padStart(2, "0").toUpperCase()).join(":");

describe("assetlinks.json", () => {
  it("monta o vínculo com o pacote e a impressão digital", () => {
    expect(buildAssetLinks({ ANDROID_APP_PACKAGE: "br.com.eneven.agenda", ANDROID_APP_SHA256_FINGERPRINTS: FP })).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: "br.com.eneven.agenda", sha256_cert_fingerprints: [FP] },
      },
    ]);
  });

  it("aceita várias impressões (Play e upload), em minúsculas, sem repetir", () => {
    const other = FP.replace(/^../, "FF");
    const links = buildAssetLinks({ ANDROID_APP_PACKAGE: "br.com.eneven.agenda", ANDROID_APP_SHA256_FINGERPRINTS: ` ${FP.toLowerCase()} , ${other},${FP}` });
    expect(links?.[0].target.sha256_cert_fingerprints).toEqual([FP, other]);
  });

  it("sem variável ou com valor inválido não publica nada (404)", () => {
    expect(buildAssetLinks({})).toBeNull();
    expect(buildAssetLinks({ ANDROID_APP_PACKAGE: "br.com.eneven.agenda" })).toBeNull();
    expect(buildAssetLinks({ ANDROID_APP_PACKAGE: "agenda", ANDROID_APP_SHA256_FINGERPRINTS: FP })).toBeNull();
    expect(buildAssetLinks({ ANDROID_APP_PACKAGE: "br.com.eneven.agenda", ANDROID_APP_SHA256_FINGERPRINTS: "AB:CD" })).toBeNull();
    expect(buildAssetLinks({ ANDROID_APP_PACKAGE: "br.com.eneven.agenda", ANDROID_APP_SHA256_FINGERPRINTS: `${FP},xx` })).toBeNull();
  });
});
