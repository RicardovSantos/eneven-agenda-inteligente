import { expect, it, vi } from "vitest";
import { fetchMercadoPagoResource } from "@/server/billing/mercado-pago-client";

it("consulta o recurso correto e rejeita respostas ou identificadores divergentes", async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ id: 123, status: "approved" }), { status: 200 }));
  expect(await fetchMercadoPagoResource("payment", "123", "token", fetcher)).toMatchObject({ id: 123 });
  expect(fetcher.mock.calls[0][0]).toBe("https://api.mercadopago.com/v1/payments/123");
  expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "error", headers: { Authorization: "Bearer token" } });
  await expect(fetchMercadoPagoResource("payment", "../other", "token", fetcher)).rejects.toThrow("Identificador inválido");
  await expect(fetchMercadoPagoResource("payment", "124", "token", fetcher)).rejects.toThrow("Resposta inválida");
  await expect(fetchMercadoPagoResource("payment", "123", undefined, fetcher)).rejects.toThrow("não configurado");
});
