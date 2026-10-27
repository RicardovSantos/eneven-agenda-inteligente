import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getDb } from "@/db/client";
import { initialsOf } from "@/lib/initial";
import { getLogo } from "@/server/settings";
import { getPublicTenant } from "@/server/public/tenant";

export const alt = "Agende online";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// A prévia do link muda pouco: 5 minutos de cache bastam para trocas de nome, cor e logo aparecerem.
export const revalidate = 300;

const INK = "#29303C";
const MUTED = "#5E6475";
const CANVAS = "#F7F6FC";
const MAX_NAME = 60;

/**
 * Outfit Bold (fonte dos títulos do produto, licença OFL em src/assets/fonts).
 * Se o arquivo não puder ser lido a imagem sai com a fonte padrão, nunca falha.
 */
async function loadOutfitBold(): Promise<ArrayBuffer | null> {
  try {
    // `outputFileTracingIncludes` (next.config.ts) leva o arquivo para o build standalone/Docker.
    const file = await readFile(join(process.cwd(), "src/assets/fonts/Outfit-Bold.woff"));
    return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  } catch {
    return null;
  }
}

/** Tamanho do nome conforme o comprimento, para caber em até duas linhas. */
function nameSize(name: string): number {
  const length = Array.from(name).length;
  if (length <= 16) return 88;
  if (length <= 28) return 68;
  return 54;
}

/**
 * Imagem de prévia do link (WhatsApp, Instagram): logo ou iniciais na cor do
 * salão, nome, "Agende online" e o fio do tempo Eneven na base.
 */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const resolved = await getPublicTenant(slug);

  let name = "Eneven Agenda";
  let color = "#3E07D2";
  let logo: string | null = null;
  if (resolved) {
    name = resolved.tenant.name;
    color = resolved.tenant.brandColor;
    if (resolved.tenant.logoUrl) {
      const stored = await getLogo(await getDb(), resolved.tenant.id);
      if (stored) logo = `data:${stored.mime};base64,${stored.data.toString("base64")}`;
    }
  }
  const outfit = await loadOutfitBold();
  const chars = Array.from(name);
  const shownName = chars.length > MAX_NAME ? `${chars.slice(0, MAX_NAME - 1).join("")}…` : name;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: CANVAS,
          padding: "72px 80px 68px",
          fontFamily: outfit ? "Outfit" : undefined,
        }}
      >
        <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 56 }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- ImageResponse (satori) não usa next/image
            <img
              src={logo}
              alt=""
              width={220}
              height={220}
              style={{ width: 220, height: 220, borderRadius: 52, objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: 220,
                height: 220,
                borderRadius: 48,
                background: color,
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 96,
                fontWeight: 700,
              }}
            >
              {initialsOf(shownName)}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                fontSize: nameSize(shownName),
                fontWeight: 700,
                color: INK,
                lineHeight: 1.1,
                letterSpacing: -1,
              }}
            >
              {shownName}
            </div>
            <div style={{ display: "flex", fontSize: 40, color: MUTED }}>Agende online</div>
          </div>
        </div>

        {/* Fio do tempo Eneven: traço no degradê terminando em ponto. */}
        <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
          <div
            style={{ width: 28, height: 28, borderRadius: 14, background: "#3E07D2", display: "flex" }}
          />
          <div
            style={{
              flex: 1,
              height: 8,
              display: "flex",
              background: "linear-gradient(90deg, #3E07D2, #9429F7, #F581FB)",
            }}
          />
        </div>
      </div>
    ),
    {
      ...size,
      fonts: outfit ? [{ name: "Outfit", data: outfit, weight: 700, style: "normal" }] : undefined,
    },
  );
}
