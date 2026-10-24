import { afterEach, describe, expect, it, vi } from "vitest";
import { signValue, verifyValue } from "@/server/auth/signed-cookie";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("signed cookie", () => {
  it("assina e verifica um valor", () => {
    expect(verifyValue(signValue({ a: 1 }, 60))).toEqual({ a: 1 });
  });

  it("rejeita valor adulterado (assinatura ou conteúdo)", () => {
    const value = signValue({ a: 1 }, 60);
    const last = value.at(-1) === "x" ? "y" : "x";
    expect(verifyValue(value.slice(0, -1) + last)).toBeNull();

    const [body, signature] = value.split(".");
    const forged = Buffer.from(
      JSON.stringify({ exp: Date.now() + 60_000, data: { a: 2 } }),
    ).toString("base64url");
    expect(verifyValue(`${forged}.${signature}`)).toBeNull();
    expect(verifyValue(`${body}.`)).toBeNull();
  });

  it("rejeita valor vencido", () => {
    expect(verifyValue(signValue({ a: 1 }, -1))).toBeNull();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    const value = signValue({ a: 1 }, 60);
    vi.setSystemTime(new Date("2026-10-24T12:00:59Z"));
    expect(verifyValue(value)).toEqual({ a: 1 });
    vi.setSystemTime(new Date("2026-10-24T12:01:01Z"));
    expect(verifyValue(value)).toBeNull();
  });

  it("rejeita lixo sem lançar", () => {
    for (const junk of ["", "abc", "a.b.c", ".", "%%%.%%%"]) {
      expect(verifyValue(junk)).toBeNull();
    }
  });

  it("a assinatura depende do segredo", () => {
    vi.stubEnv("SESSION_SECRET", "segredo-a-segredo-a-segredo-a-segredo-a");
    const value = signValue({ a: 1 }, 60);
    expect(verifyValue(value)).toEqual({ a: 1 });
    vi.stubEnv("SESSION_SECRET", "segredo-b-segredo-b-segredo-b-segredo-b");
    expect(verifyValue(value)).toBeNull();
  });

  it("em produção sem SESSION_SECRET lança; em desenvolvimento usa o segredo de desenvolvimento", () => {
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => signValue({ a: 1 }, 60)).toThrow(/SESSION_SECRET/);
    expect(() => verifyValue("a.b")).toThrow(/SESSION_SECRET/);

    vi.stubEnv("NODE_ENV", "development");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(verifyValue(signValue({ a: 1 }, 60))).toEqual({ a: 1 });
    warn.mockRestore();
  });
});
