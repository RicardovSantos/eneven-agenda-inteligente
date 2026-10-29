import { describe, expect, it } from "vitest";
import { parseClientsQuery } from "@/app/painel/clientes/list-data";

describe("parseClientsQuery", () => {
  it("padrões", () => {
    expect(parseClientsQuery({})).toEqual({ q: "", filtro: undefined, pagina: 1 });
  });

  it("filtro: só os dois valores conhecidos", () => {
    expect(parseClientsQuery({ filtro: "com-horario" }).filtro).toBe("com-horario");
    expect(parseClientsQuery({ filtro: "sem-voltar" }).filtro).toBe("sem-voltar");
    expect(parseClientsQuery({ filtro: "todos" }).filtro).toBeUndefined();
    expect(parseClientsQuery({ filtro: "upcoming" }).filtro).toBeUndefined();
  });

  it("página: inteiro >= 1, no máximo 40", () => {
    expect(parseClientsQuery({ pagina: "3" }).pagina).toBe(3);
    expect(parseClientsQuery({ pagina: "0" }).pagina).toBe(1);
    expect(parseClientsQuery({ pagina: "-2" }).pagina).toBe(1);
    expect(parseClientsQuery({ pagina: "2.5" }).pagina).toBe(1);
    expect(parseClientsQuery({ pagina: "abc" }).pagina).toBe(1);
    expect(parseClientsQuery({ pagina: "" }).pagina).toBe(1);
    expect(parseClientsQuery({ pagina: "40" }).pagina).toBe(40);
    expect(parseClientsQuery({ pagina: "9999" }).pagina).toBe(40);
  });

  it("valores repetidos na URL: vale o primeiro", () => {
    expect(parseClientsQuery({ q: ["ana", "bia"], filtro: ["sem-voltar", "x"], pagina: ["2", "5"] })).toEqual({
      q: "ana",
      filtro: "sem-voltar",
      pagina: 2,
    });
  });

  it("busca: sem espaços nas pontas e até 80 caracteres", () => {
    expect(parseClientsQuery({ q: "  ana  " }).q).toBe("ana");
    expect(parseClientsQuery({ q: "x".repeat(200) }).q).toHaveLength(80);
  });
});
