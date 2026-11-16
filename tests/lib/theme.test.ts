import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THEME_INIT_SCRIPT,
  PUBLIC_THEME_STORAGE_KEY,
  THEME_STORAGE_KEY,
  applyThemePreference,
  parseThemePreference,
  readThemePreference,
  themeStorageKey,
} from "@/lib/theme";

function fakeRoot() {
  const classes = new Set<string>();
  return {
    classes,
    root: {
      classList: {
        add: (c: string) => classes.add(c),
        remove: (...cs: string[]) => cs.forEach((c) => classes.delete(c)),
      },
    } as unknown as HTMLElement,
  };
}

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("tema", () => {
  it("só aceita claro e escuro; o resto vira automático", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("auto")).toBe("auto");
    expect(parseThemePreference("roxo")).toBe("auto");
    expect(parseThemePreference(null)).toBe("auto");
  });

  it("escuro e claro entram no <html> e são salvos; automático limpa tudo", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    const { root, classes } = fakeRoot();

    applyThemePreference("dark", root);
    expect([...classes]).toEqual(["dark"]);
    expect(storage.data.get(THEME_STORAGE_KEY)).toBe("dark");

    applyThemePreference("light", root);
    expect([...classes]).toEqual(["light"]);
    expect(readThemePreference()).toBe("light");

    applyThemePreference("auto", root);
    expect(classes.size).toBe(0);
    expect(storage.data.has(THEME_STORAGE_KEY)).toBe(false);
    expect(readThemePreference()).toBe("auto");
  });

  it("armazenamento bloqueado não quebra a troca", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
      removeItem: () => {
        throw new Error("bloqueado");
      },
    });
    const { root, classes } = fakeRoot();
    expect(() => applyThemePreference("dark", root)).not.toThrow();
    expect([...classes]).toEqual(["dark"]);
    expect(readThemePreference()).toBe("auto");
  });

  it("o script inicial aplica só uma escolha válida e ignora falhas", () => {
    function run(stored: string | null, throws = false) {
      const { root, classes } = fakeRoot();
      const localStorage = {
        getItem: () => {
          if (throws) throw new Error("bloqueado");
          return stored;
        },
      };
      runInNewContext(THEME_INIT_SCRIPT, { localStorage, document: { documentElement: root } });
      return [...classes];
    }
    expect(run("dark")).toEqual(["dark"]);
    expect(run("light")).toEqual(["light"]);
    expect(run("auto")).toEqual([]);
    expect(run(null)).toEqual([]);
    expect(run("dark", true)).toEqual([]);
  });

  it("o painel e as telas do cliente guardam o tema em chaves separadas", () => {
    expect(themeStorageKey("/painel/configuracoes")).toBe(THEME_STORAGE_KEY);
    expect(themeStorageKey("/entrar")).toBe(THEME_STORAGE_KEY);
    expect(themeStorageKey("/")).toBe(THEME_STORAGE_KEY);
    expect(themeStorageKey("/agendamento/abc123")).toBe(PUBLIC_THEME_STORAGE_KEY);
    expect(themeStorageKey("/studio-aurora")).toBe(PUBLIC_THEME_STORAGE_KEY);
    expect(themeStorageKey("/studio-aurora/profissional/7")).toBe(PUBLIC_THEME_STORAGE_KEY);
    expect(themeStorageKey(null)).toBe(THEME_STORAGE_KEY);
  });

  it("escolher o tema numa tela pública não mexe na escolha do painel, e vice-versa", () => {
    const storage = fakeStorage({ [THEME_STORAGE_KEY]: "dark" });
    vi.stubGlobal("localStorage", storage);
    const { root } = fakeRoot();

    vi.stubGlobal("location", { pathname: "/agendamento/abc123" });
    expect(readThemePreference()).toBe("auto"); // o escuro do painel não vale aqui
    applyThemePreference("light", root);
    expect(storage.data.get(PUBLIC_THEME_STORAGE_KEY)).toBe("light");
    expect(storage.data.get(THEME_STORAGE_KEY)).toBe("dark");

    vi.stubGlobal("location", { pathname: "/painel" });
    expect(readThemePreference()).toBe("dark");
  });

  it("o script inicial lê a chave certa para cada tipo de tela", () => {
    function run(pathname: string, stored: Record<string, string>) {
      const { root, classes } = fakeRoot();
      const localStorage = { getItem: (k: string) => stored[k] ?? null };
      runInNewContext(THEME_INIT_SCRIPT, {
        localStorage,
        location: { pathname },
        document: { documentElement: root },
      });
      return [...classes];
    }
    const painelEscuro = { [THEME_STORAGE_KEY]: "dark" };
    expect(run("/agendamento/abc123", painelEscuro)).toEqual([]);
    expect(run("/studio-aurora", painelEscuro)).toEqual([]);
    expect(run("/painel", painelEscuro)).toEqual(["dark"]);
    expect(run("/agendamento/abc123", { [PUBLIC_THEME_STORAGE_KEY]: "light" })).toEqual(["light"]);
  });
});
