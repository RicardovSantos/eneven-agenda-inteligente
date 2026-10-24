import { describe, expect, it } from "vitest";
import { canAccessTenantPanel } from "@/server/auth/guard";
import type { SessionInfo } from "@/server/auth/session";

const sessao: SessionInfo = {
  userId: "u1",
  tenantId: "t1",
  role: "owner",
  isSuperAdmin: false,
  emailVerified: true,
};

describe("canAccessTenantPanel", () => {
  it("nega sem sessão", () => {
    expect(canAccessTenantPanel(null)).toBe(false);
  });

  it("nega sem papel no tenant", () => {
    expect(canAccessTenantPanel({ ...sessao, role: null })).toBe(false);
  });

  it("nega sem tenant", () => {
    expect(canAccessTenantPanel({ ...sessao, tenantId: null })).toBe(false);
  });

  it("nega super-admin sem tenant", () => {
    expect(
      canAccessTenantPanel({ ...sessao, tenantId: null, role: null, isSuperAdmin: true }),
    ).toBe(false);
  });

  it("libera sessão completa", () => {
    expect(canAccessTenantPanel(sessao)).toBe(true);
    expect(canAccessTenantPanel({ ...sessao, role: "staff" })).toBe(true);
  });
});
