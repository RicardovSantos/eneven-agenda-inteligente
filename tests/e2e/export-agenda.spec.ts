import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { loginAs, loginAsMember, open, seedBooking, seedTenant } from "./helpers";

test("dono baixa seus dados e a equipe não acessa a exportação", async ({ page, request }) => {
  const { slug } = await seedTenant(request);
  const booking = await seedBooking(request, slug);
  await loginAs(page, request, slug);
  await open(page, "/painel/configuracoes/dados");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: /Baixar dados do estabelecimento/ }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("eneven-agenda.json");
  const filePath = await download.path();
  if (!filePath) throw new Error("Arquivo não disponível.");
  const content = await readFile(filePath, "utf8");
  const data = JSON.parse(content) as { bookings: Array<{ id: string }> };
  expect(data.bookings.some((row) => row.id === booking.bookingId)).toBe(true);
  expect(content).not.toContain(booking.token);
  await loginAsMember(page, request, slug, "staff");
  expect((await page.request.get("/api/painel/exportar-agenda")).status()).toBe(403);
});
