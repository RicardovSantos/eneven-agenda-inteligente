import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { signValue, verifyValue } from "@/server/auth/signed-cookie";

const P = "teste";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("signed cookie", () => {
  it("assina e verifica um valor", () => {
    expect(verifyValue(signValue({ a: 1 }, 60, P), P)).toEqual({ a: 1 });
  });

  it("rejeita valor adulterado (assinatura ou conteúdo)", () => {
    const value = signValue({ a: 1 }, 60, P);
    const last = value.at(-1) === "x" ? "y" : "x";
    expect(verifyValue(value.slice(0, -1) + last, P)).toBeNull();

    const [body, signature] = value.split(".");
    const forged = Buffer.from(
      JSON.stringify({ exp: Date.now() + 60_000, data: { a: 2 } }),
    ).toString("base64url");
    expect(verifyValue(`${forged}.${signature}`, P)).toBeNull();
    expect(verifyValue(`${body}.`, P)).toBeNull();
  });

  it("rejeita valor vencido", () => {
    expect(verifyValue(signValue({ a: 1 }, -1, P), P)).toBeNull();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    const value = signValue({ a: 1 }, 60, P);
    vi.setSystemTime(new Date("2026-10-24T12:00:59Z"));
    expect(verifyValue(value, P)).toEqual({ a: 1 });
    vi.setSystemTime(new Date("2026-10-24T12:01:01Z"));
    expect(verifyValue(value, P)).toBeNull();
  });

  it("rejeita lixo sem lançar", () => {
    for (const junk of ["", "abc", "a.b.c", ".", "%%%.%%%"]) {
      expect(verifyValue(junk, P)).toBeNull();
    }
  });

  it("a assinatura depende do segredo", () => {
    vi.stubEnv("SESSION_SECRET", "segredo-a-segredo-a-segredo-a-segredo-a");
    const value = signValue({ a: 1 }, 60, P);
    expect(verifyValue(value, P)).toEqual({ a: 1 });
    vi.stubEnv("SESSION_SECRET", "segredo-b-segredo-b-segredo-b-segredo-b");
    expect(verifyValue(value, P)).toBeNull();
  });

  it("a assinatura depende do propósito: valor de um cookie não vale em outro", () => {
    const value = signValue({ a: 1 }, 60, "ea_google_pending");
    expect(verifyValue(value, "ea_google_pending")).toEqual({ a: 1 });
    expect(verifyValue(value, "outro_cookie")).toBeNull();
    expect(verifyValue(value, "")).toBeNull();
  });

  it("o HMAC cobre `propósito|corpo`", () => {
    vi.stubEnv("SESSION_SECRET", "segredo-a-segredo-a-segredo-a-segredo-a");
    const value = signValue({ a: 1 }, 60, "ea_google_pending");
    const [body, signature] = value.split(".");
    const expected = createHmac("sha256", "segredo-a-segredo-a-segredo-a-segredo-a")
      .update(`ea_google_pending|${body}`)
      .digest("base64url");
    expect(signature).toBe(expected);
  });

  it("em produção sem SESSION_SECRET lança; em desenvolvimento usa o segredo de desenvolvimento", () => {
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => signValue({ a: 1 }, 60, P)).toThrow(/SESSION_SECRET/);
    expect(() => verifyValue("a.b", P)).toThrow(/SESSION_SECRET/);

    vi.stubEnv("NODE_ENV", "development");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(verifyValue(signValue({ a: 1 }, 60, P), P)).toEqual({ a: 1 });
    warn.mockRestore();
  });

  it("recusa o segredo de desenvolvimento sempre que APP_URL for https", () => {
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_URL", "https://agenda.eneven.com.br");
    expect(() => signValue({ a: 1 }, 60, P)).toThrow(/SESSION_SECRET/);
    expect(() => verifyValue("a.b", P)).toThrow(/SESSION_SECRET/);

    // http (desenvolvimento local) continua podendo usar o segredo fixo.
    vi.stubEnv("APP_URL", "http://localhost:3000");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(verifyValue(signValue({ a: 1 }, 60, P), P)).toEqual({ a: 1 });
    warn.mockRestore();
  });

  it("com SESSION_SECRET definido, APP_URL https é aceito", () => {
    vi.stubEnv("SESSION_SECRET", "segredo-a-segredo-a-segredo-a-segredo-a");
    vi.stubEnv("APP_URL", "https://agenda.eneven.com.br");
    expect(verifyValue(signValue({ a: 1 }, 60, P), P)).toEqual({ a: 1 });
  });
});
