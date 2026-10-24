import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/types";

const mocks = vi.hoisted(() => ({
  hashPassword: vi.fn<(password: string) => Promise<string>>(),
  verifyPassword: vi.fn<(hash: string, password: string) => Promise<boolean>>(),
}));

vi.mock("@/server/auth/password", () => mocks);

/** Banco que nunca acha ninguém: o login cai no caminho do hash descartável. */
const emptyDb = {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
} as unknown as Db;

describe("hash descartável do login", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.hashPassword.mockReset();
    mocks.verifyPassword.mockReset();
    mocks.hashPassword.mockResolvedValue("$argon2id$hash-descartavel");
    mocks.verifyPassword.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("é calculado ao carregar o módulo, uma única vez", async () => {
    const { login } = await import("@/server/auth/login");
    expect(mocks.hashPassword).toHaveBeenCalledTimes(1);

    expect(await login(emptyDb, "ninguem@defendi.com", "qualquer")).toBeNull();
    expect(await login(emptyDb, "outro@defendi.com", "qualquer")).toBeNull();

    expect(mocks.hashPassword).toHaveBeenCalledTimes(1);
    expect(mocks.verifyPassword).toHaveBeenCalledTimes(2);
    expect(mocks.verifyPassword).toHaveBeenCalledWith("$argon2id$hash-descartavel", "qualquer");
  });

  it("se o cálculo falhar, não sobra promessa rejeitada e o login continua respondendo", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.hashPassword.mockRejectedValue(new Error("sem memória"));

    const { login } = await import("@/server/auth/login");
    expect(await login(emptyDb, "ninguem@defendi.com", "qualquer")).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.off("unhandledRejection", unhandled);

    expect(unhandled).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
  });
});
