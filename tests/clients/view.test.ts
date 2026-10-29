import { describe, expect, it } from "vitest";
import { clientSub, clientsHref, initialsOf, toClientRow } from "@/components/clients/view";

const TZ = "America/Sao_Paulo";
const now = new Date("2026-10-27T15:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("textos da lista de clientes", () => {
  it("iniciais: primeiro e último nome", () => {
    expect(initialsOf("Paula Martins")).toBe("PM");
    expect(initialsOf("ana maria de souza")).toBe("AS");
    expect(initialsOf("Bia")).toBe("B");
  });

  it("linha de apoio do celular", () => {
    const base = { nextBookingAt: null, lastVisitAt: null };
    expect(clientSub(base, now, TZ, 60)).toBe("Ainda sem visitas");
    expect(clientSub({ ...base, lastVisitAt: now }, now, TZ, 60)).toBe("Última visita hoje");
    expect(clientSub({ ...base, lastVisitAt: daysAgo(7) }, now, TZ, 60)).toBe("Última visita 20/10");
    expect(clientSub({ ...base, lastVisitAt: daysAgo(86) }, now, TZ, 60)).toBe("Sem voltar há 86 dias");
    expect(
      clientSub({ lastVisitAt: daysAgo(86), nextBookingAt: new Date("2026-11-07T13:00:00Z") }, now, TZ, 60),
    ).toBe("Próximo: 07/11 às 10:00");
  });

  it("linha da tabela: total vazio para staff e plural de visitas", () => {
    const item = {
      id: "1",
      name: "Paula Martins",
      phone: "5511981234567",
      visits: 1,
      totalCents: null,
      noShows: 0,
      lastVisitAt: new Date("2026-10-06T17:00:00Z"),
      nextBookingAt: null,
    };
    expect(toClientRow(item, now, TZ, 60)).toMatchObject({
      phone: "(11) 98123-4567",
      last: "06/10/2026",
      visitsLabel: "1 visita",
      total: null,
      next: null,
    });
    expect(toClientRow({ ...item, visits: 12, totalCents: 108000 }, now, TZ, 60)).toMatchObject({
      visitsLabel: "12 visitas",
      total: "R$ 1.080,00",
    });
  });

  it("endereços mantêm busca, filtro e páginas", () => {
    expect(clientsHref()).toBe("/painel/clientes");
    expect(clientsHref({ id: "abc", q: "ana", filtro: "sem-voltar", pagina: 3 })).toBe(
      "/painel/clientes/abc?q=ana&filtro=sem-voltar&pagina=3",
    );
    expect(clientsHref({ pagina: 1, historico: true })).toBe("/painel/clientes?historico=todos");
  });
});
