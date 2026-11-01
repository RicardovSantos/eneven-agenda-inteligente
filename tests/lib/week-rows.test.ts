import { describe, expect, it } from "vitest";
import { facebookUrl, instagramUrl, mapApps } from "@/lib/public-links";
import { weekRows } from "@/lib/week-rows";
import { emptyWeek } from "@/lib/weekly-hours";

const range = (start: string, end: string) => [{ start, end }];

describe("weekRows", () => {
  it("agrupa dias seguidos com o mesmo horário e mostra o domingo fechado", () => {
    const week = emptyWeek();
    for (const day of [1, 2, 3, 4, 5]) week[day as 1] = range("09:00", "18:00");
    week[6] = range("09:00", "14:00");
    expect(weekRows(week)).toEqual([
      { label: "Segunda a sexta", text: "09:00 às 18:00", closed: false },
      { label: "Sábado", text: "09:00 às 14:00", closed: false },
      { label: "Domingo", text: "Fechado", closed: true },
    ]);
  });

  it("junta sábado e domingo fechados e mostra mais de um intervalo no dia", () => {
    const week = emptyWeek();
    for (const day of [1, 2, 3, 4, 5]) {
      week[day as 1] = [
        { start: "09:00", end: "12:00" },
        { start: "14:00", end: "18:00" },
      ];
    }
    expect(weekRows(week)).toEqual([
      { label: "Segunda a sexta", text: "09:00 às 12:00, 14:00 às 18:00", closed: false },
      { label: "Sábado e domingo", text: "Fechado", closed: true },
    ]);
  });

  it("estabelecimento sem horário: uma linha fechada", () => {
    expect(weekRows(emptyWeek())).toEqual([
      { label: "Segunda a domingo", text: "Fechado", closed: true },
    ]);
  });
});

describe("links públicos", () => {
  it("monta os links dos três aplicativos de mapa com o endereço codificado", () => {
    const apps = mapApps("Rua Jorge Augusto, 409, apto 13");
    expect(apps.map((a) => a.id)).toEqual(["waze", "google", "apple"]);
    const q = encodeURIComponent("Rua Jorge Augusto, 409, apto 13");
    expect(apps[0].href).toBe(`https://waze.com/ul?q=${q}&navigate=yes`);
    expect(apps[1].href).toBe(`https://www.google.com/maps/search/?api=1&query=${q}`);
    expect(apps[2].href).toBe(`https://maps.apple.com/?q=${q}`);
  });

  it("monta os links das redes sociais", () => {
    expect(instagramUrl("studio.ricardo")).toBe("https://instagram.com/studio.ricardo");
    expect(facebookUrl("studioricardo")).toBe("https://facebook.com/studioricardo");
  });
});
