import { describe, expect, it } from "vitest";
import {
  categoryCounts,
  fold,
  groupServices,
  matchRange,
  showGroupHeaders,
} from "@/lib/service-groups";

const item = (name: string, categoryName: string | null) => ({ name, categoryName });
const list = [
  item("Corte masculino", "Cabelo"),
  item("Limpeza de pele", null),
  item("Designer", "Sobrancelhas"),
  item("Progressiva", "Cabelo"),
  item("Micropigmentação", "Sobrancelhas"),
  item("Maquiagem", "  "),
];

describe("service-groups", () => {
  it("agrupa pela ordem de aparição e deixa 'Outros serviços' por último", () => {
    const groups = groupServices(list);
    expect(groups.map((g) => g.category)).toEqual(["Cabelo", "Sobrancelhas", null]);
    expect(groups[0]!.items.map((i) => i.name)).toEqual(["Corte masculino", "Progressiva"]);
    expect(groups[2]!.items.map((i) => i.name)).toEqual(["Limpeza de pele", "Maquiagem"]);
  });

  it("conta por categoria", () => {
    expect(categoryCounts(list)).toEqual([
      { category: "Cabelo", count: 2 },
      { category: "Sobrancelhas", count: 2 },
      { category: null, count: 2 },
    ]);
  });

  it("busca ignora acento e maiúscula, no nome ou na categoria", () => {
    expect(groupServices(list, { query: "MICROPIGMENTACAO" })[0]!.items).toHaveLength(1);
    expect(groupServices(list, { query: "sobrancelha" })[0]!.items).toHaveLength(2);
    expect(groupServices(list, { query: "xyz" })).toEqual([]);
  });

  it("filtra por categoria, incluindo 'Outros' (texto vazio)", () => {
    expect(groupServices(list, { category: "Cabelo" })).toHaveLength(1);
    const others = groupServices(list, { category: "" });
    expect(others.map((g) => g.category)).toEqual([null]);
  });

  it("busca e categoria funcionam juntas", () => {
    const groups = groupServices(list, { category: "Cabelo", query: "corte" });
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items[0]!.name).toBe("Corte masculino");
  });

  it("destaca sem mudar o tamanho do texto", () => {
    expect(fold("Micropigmentação")).toHaveLength("Micropigmentação".length);
    expect(matchRange("Micropigmentação", "pigmentacao")).toEqual([5, 16]);
    expect(matchRange("Designer", "  ")).toBeNull();
    expect(matchRange("Designer", "zzz")).toBeNull();
  });

  it("só mostra cabeçalho quando há mais de um grupo ou o grupo tem nome", () => {
    expect(showGroupHeaders(groupServices([item("A", null)]))).toBe(false);
    expect(showGroupHeaders(groupServices([item("A", null), item("B", null)]))).toBe(false);
    expect(showGroupHeaders(groupServices([item("A", "X")]))).toBe(true);
    expect(showGroupHeaders(groupServices(list))).toBe(true);
  });
});
