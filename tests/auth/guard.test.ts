import { describe, expect, it } from "vitest";
import { canAccessAdmin, canAccessTenantPanel, homePathFor } from "@/server/auth/guard";
import type { SessionInfo } from "@/server/auth/session";

const sessao: SessionInfo = {
  userId: "u1",
  tenantId: "t1",
  role: "owner",
  isSuperAdmin: false,
  emailVerified: true,
  support: false,
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

describe("canAccessAdmin", () => {
  it("nega sem sessão", () => {
    expect(canAccessAdmin(null)).toBe(false);
  });

  it("nega quem não é super-admin, mesmo com estabelecimento", () => {
    expect(canAccessAdmin(sessao)).toBe(false);
    expect(canAccessAdmin({ ...sessao, role: "owner", isSuperAdmin: false })).toBe(false);
  });

  it("libera super-admin, com ou sem estabelecimento", () => {
    expect(canAccessAdmin({ ...sessao, tenantId: null, role: null, isSuperAdmin: true })).toBe(true);
    expect(canAccessAdmin({ ...sessao, isSuperAdmin: true })).toBe(true);
  });
});

describe("homePathFor", () => {
  it("sem sessão: null", () => {
    expect(homePathFor(null)).toBeNull();
  });

  it("estabelecimento -> /painel (também para super-admin com estabelecimento)", () => {
    expect(homePathFor(sessao)).toBe("/painel");
    expect(homePathFor({ ...sessao, isSuperAdmin: true })).toBe("/painel");
  });

  it("super-admin sem estabelecimento -> /admin", () => {
    expect(homePathFor({ ...sessao, tenantId: null, role: null, isSuperAdmin: true })).toBe("/admin");
  });

  it("sessão sem acesso a nada: null", () => {
    expect(homePathFor({ ...sessao, tenantId: null, role: null })).toBeNull();
  });
});
