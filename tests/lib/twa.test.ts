import { describe, expect, it } from "vitest";
import { TWA_INIT_SCRIPT, TWA_STORAGE_KEY } from "@/lib/twa";

/** Executa o script do <head> numa página simulada e devolve o atributo data-app resultante. */
function run(options: { referrer?: string; search?: string; stored?: boolean; storageBroken?: boolean }) {
  const store = new Map<string, string>(options.stored ? [[TWA_STORAGE_KEY, "1"]] : []);
  const attributes = new Map<string, string>();
  const sessionStorage = {
    getItem: (key: string) => {
      if (options.storageBroken) throw new Error("bloqueado");
      return store.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (options.storageBroken) throw new Error("bloqueado");
      store.set(key, value);
    },
  };
  const document = {
    referrer: options.referrer ?? "",
    documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) },
  };
  const location = { search: options.search ?? "" };
  new Function("document", "location", "sessionStorage", "URLSearchParams", TWA_INIT_SCRIPT)(document, location, sessionStorage, URLSearchParams);
  return { app: attributes.get("data-app"), stored: store.get(TWA_STORAGE_KEY) };
}

describe("detecção do app Android (TWA)", () => {
  it("referrer android-app:// marca o app e guarda para as próximas páginas", () => {
    expect(run({ referrer: "android-app://br.com.eneven.agenda" })).toEqual({ app: "twa", stored: "1" });
  });

  it("?origem=app (endereço de abertura do app) também marca", () => {
    expect(run({ search: "?origem=app" })).toEqual({ app: "twa", stored: "1" });
  });

  it("páginas seguintes (sem referrer) continuam no modo app pelo sessionStorage", () => {
    expect(run({ referrer: "https://agenda.eneven.com.br/painel", stored: true }).app).toBe("twa");
  });

  it("navegador comum não é marcado", () => {
    expect(run({ referrer: "https://www.google.com/" })).toEqual({ app: undefined, stored: undefined });
    expect(run({})).toEqual({ app: undefined, stored: undefined });
    expect(run({ search: "?origem=site" }).app).toBeUndefined();
  });

  it("sessionStorage bloqueado não quebra: a página atual ainda é marcada", () => {
    expect(run({ referrer: "android-app://br.com.eneven.agenda", storageBroken: true }).app).toBe("twa");
    expect(run({ referrer: "https://x.com/", storageBroken: true }).app).toBeUndefined();
  });
});
