import { expect, it } from "vitest";
import { getDemoSelection } from "@/app/demo/dados";

it("aceita somente serviços e horários fictícios conhecidos", () => {
  expect(getDemoSelection("1", "10:30")).toEqual({ service: { name: "Manicure", duration: "40 min", price: "R$ 40" }, time: "10:30" });
  for (const [service, time] of [["3", "10:30"], ["01", "10:30"], ["0", "11:00"], [["0"], "09:00"], ["0", ["09:00"]]]) {
    expect(getDemoSelection(service, time)).toBeNull();
  }
});
