import { buildManifest as manifest } from "@/lib/pwa-manifest";
import { PRODUCT_NAME, PRODUCT_SHORT_NAME } from "@/lib/brand";

describe("manifest", () => {
  const m = manifest();

  it("identifica o app e abre no painel em modo standalone", () => {
    expect(m.name).toBe(PRODUCT_NAME);
    expect(m.name).toBe("Eneven Agendamentos Inteligentes");
    expect(m.short_name).toBe(PRODUCT_SHORT_NAME);
    expect(m.short_name).toBe("Eneven Agenda");
    expect(m.start_url).toBe("/painel");
    expect(m.display).toBe("standalone");
    expect(m.lang).toBe("pt-BR");
    expect(m.theme_color).toBe("#3E07D2");
    expect(m.background_color).toBe("#FFFFFF");
  });

  it("declara ícones 192, 512 e maskable 512", () => {
    const icons = m.icons ?? [];
    expect(
      icons.some((i) => i.src === "/app-icons/calendar-v1-192.png" && i.sizes === "192x192" && i.purpose === "any"),
    ).toBe(true);
    expect(
      icons.some((i) => i.src === "/app-icons/calendar-v1-512.png" && i.sizes === "512x512" && i.purpose === "any"),
    ).toBe(true);
    expect(
      icons.some(
        (i) => i.src === "/app-icons/calendar-v1-maskable.png" && i.purpose === "maskable" && i.sizes === "512x512",
      ),
    ).toBe(true);
    for (const icon of icons) expect(icon.type).toBe("image/png");
  });

  it("traz os atalhos Agenda de hoje e Novo agendamento", () => {
    const shortcuts = m.shortcuts ?? [];
    expect(shortcuts.find((s) => s.name === "Agenda de hoje")?.url).toBe("/painel?view=dia");
    expect(shortcuts.find((s) => s.name === "Novo agendamento")?.url).toBe("/painel?novo=1");
  });
});

