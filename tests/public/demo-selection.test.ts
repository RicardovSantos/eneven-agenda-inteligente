import { expect, it } from "vitest";
import { getDemoSelection } from "@/app/demo/dados";

it("aceita somente serviços e horários fictícios conhecidos", () => {
  const now = new Date("2030-01-02T02:30:00Z");
  expect(getDemoSelection("1", "10:30", "2030-01-01", now)).toEqual({ service: { name: "Manicure", duration: "40 min", price: "R$ 40" }, time: "10:30" });
  expect(getDemoSelection("1", "10:30", "2030-01-01", new Date("2030-01-02T03:00:00Z"))).toBeNull();
  for (const [service, time] of [["3", "10:30"], ["01", "10:30"], ["0", "11:00"], [["0"], "09:00"], ["0", ["09:00"]]]) {
    expect(getDemoSelection(service, time, "2030-01-01", now)).toBeNull();
  }
});
