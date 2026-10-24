import { metadata, viewport } from "@/app/site-metadata";

describe("metadata do layout raiz", () => {
  it("usa o APP_URL como base e o template de título", () => {
    expect(metadata.metadataBase).toBeInstanceOf(URL);
    expect(metadata.title).toEqual({
      default: "Eneven Agendamentos Inteligentes",
      template: "%s · Eneven Agenda",
    });
  });

  it("aponta os ícones para /brand", () => {
    const icons = metadata.icons as {
      icon: { url: string }[];
      apple: string;
    };
    expect(icons.apple).toBe("/brand/apple-touch-icon.png");
    expect(icons.icon.map((i) => i.url)).toEqual(["/brand/favicon.ico", "/brand/icon-32.png"]);
  });

  it("configura o app instalável no iPhone", () => {
    expect(metadata.appleWebApp).toEqual({
      capable: true,
      title: "Eneven Agenda",
      statusBarStyle: "default",
    });
  });

  it("monta a prévia de compartilhamento (Open Graph e Twitter)", () => {
    const og = metadata.openGraph as {
      locale: string;
      siteName: string;
      images: { url: string; width: number; height: number }[];
    };
    expect(og.locale).toBe("pt_BR");
    expect(og.siteName).toBe("Eneven Agendamentos Inteligentes");
    expect(og.images[0]).toMatchObject({ url: "/brand/og-default.png", width: 1200, height: 630 });
    expect((metadata.twitter as { card: string }).card).toBe("summary_large_image");
  });

  it("define a cor do tema da barra do navegador", () => {
    expect(viewport.themeColor).toBe("#3E07D2");
  });
});
