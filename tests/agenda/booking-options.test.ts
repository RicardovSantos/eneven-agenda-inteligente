import { describe, expect, it } from "vitest";
import { panelBookingOptions } from "@/server/agenda/booking-options";

const pros = [
  { id: "p1", name: "Bia", color: "#111111" },
  { id: "p2", name: "Léo", color: null },
];
const svc = (id: string, professionalIds: string[]) => ({
  id,
  name: id,
  durationMin: 30,
  priceCents: 1000,
  professionalIds,
});
const catalog = [svc("a", ["p1"]), svc("b", ["p2"]), svc("c", [])];

describe("panelBookingOptions", () => {
  it("proprietário/recepção: todos os profissionais e só serviços que alguém faz", () => {
    const r = panelBookingOptions(pros, catalog, null);
    expect(r.professionals.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(r.services.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("staff: só o próprio profissional e os serviços dele", () => {
    const r = panelBookingOptions(pros, catalog, pros[1]);
    expect(r.professionals.map((p) => p.id)).toEqual(["p2"]);
    expect(r.services.map((s) => s.id)).toEqual(["b"]);
  });
});
