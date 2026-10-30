import { describe, expect, it } from "vitest";
import { reminderTimes } from "@/server/whatsapp/reminder-times";

describe("horários de lembretes", () => {
  it("calcula véspera e duas horas antes no fuso do salão", () => {
    const result = reminderTimes(new Date("2030-10-15T12:00:00Z"), "America/Sao_Paulo");
    expect(result.eve.toISOString()).toBe("2030-10-14T21:00:00.000Z");
    expect(result.twoHours.toISOString()).toBe("2030-10-15T10:00:00.000Z");
  });
  it("usa o dia local quando o atendimento atravessa a meia-noite UTC", () => {
    const result = reminderTimes(new Date("2030-11-01T02:30:00Z"), "America/Sao_Paulo");
    expect(result.eve.toISOString()).toBe("2030-10-30T21:00:00.000Z");
  });
});
