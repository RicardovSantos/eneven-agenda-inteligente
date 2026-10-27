import { describe, expect, it } from "vitest";
import { isTenantActive, isTenantReleased } from "@/server/tenants/release";

const NOW = new Date("2030-01-10T12:00:00.000Z");
const future = new Date("2030-01-20T12:00:00.000Z");
const past = new Date("2030-01-01T12:00:00.000Z");

describe("isTenantActive", () => {
  it("active: sempre, independente do fim do teste", () => {
    expect(isTenantActive({ status: "active", trialEndsAt: past }, NOW)).toBe(true);
  });
  it("trial dentro do prazo: sim; vencido ou no instante exato: não", () => {
    expect(isTenantActive({ status: "trial", trialEndsAt: future }, NOW)).toBe(true);
    expect(isTenantActive({ status: "trial", trialEndsAt: past }, NOW)).toBe(false);
    expect(isTenantActive({ status: "trial", trialEndsAt: NOW }, NOW)).toBe(false);
  });
  it("outros status: não", () => {
    for (const status of ["past_due", "read_only", "canceled"] as const) {
      expect(isTenantActive({ status, trialEndsAt: future }, NOW)).toBe(false);
    }
  });
});

describe("isTenantReleased (link público liberado)", () => {
  it("exige e-mail confirmado e estabelecimento ativo", () => {
    expect(isTenantReleased({ status: "trial", trialEndsAt: future, emailVerified: true }, NOW)).toBe(true);
    expect(isTenantReleased({ status: "trial", trialEndsAt: future, emailVerified: false }, NOW)).toBe(false);
    expect(isTenantReleased({ status: "trial", trialEndsAt: past, emailVerified: true }, NOW)).toBe(false);
    expect(isTenantReleased({ status: "active", trialEndsAt: past, emailVerified: true }, NOW)).toBe(true);
  });
});
