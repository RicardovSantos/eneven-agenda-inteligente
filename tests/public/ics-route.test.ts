import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/types";
import { bookPublic } from "@/server/public/booking";
import { cancelByToken } from "@/server/public/manage";
import { resetRateLimitsForTests } from "@/server/security/limits";
import { createTestDb } from "../helpers/test-db";
import { seedBookable } from "../helpers/public-fixtures";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({ getDb: async () => state.db }));
vi.mock("@/server/security/client-ip", () => ({ currentClientIp: async () => "1.1.1.1" }));

import { GET } from "@/app/api/agendamento/[token]/ics/route";

const NOW = new Date("2030-01-01T12:00:00.000Z");
let db: Db;

const call = (token: string) =>
  GET(new Request(`http://localhost/api/agendamento/${token}/ics`), {
    params: Promise.resolve({ token }),
  } as never);

beforeEach(async () => {
  resetRateLimitsForTests();
  db = await createTestDb();
  state.db = db;
});

async function newBooking() {
  const seed = await seedBookable(db, { slug: "studio", tenant: { address: "Rua X, 120" } });
  const result = await bookPublic(
    db,
    "studio",
    {
      serviceIds: [seed.serviceIds[0]],
      professionalId: "any",
      // 14:30 em São Paulo = 17:30Z
      startsAt: new Date("2030-01-08T14:30:00.000-03:00").toISOString(),
      name: "Paula",
      phone: "(11) 98765-4321",
      consent: true,
    },
    { ip: "9.9.9.9", now: NOW },
  );
  if (!result.ok) throw new Error(result.error);
  return result.token;
}

describe("GET /api/agendamento/[token]/ics", () => {
  it("devolve o arquivo de calendário com o horário em UTC, sem cache e sem o token", async () => {
    const token = await newBooking();
    const res = await call(token);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="agendamento.ics"');
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.text();
    expect(body).toContain("DTSTART:20300108T173000Z\r\n");
    expect(body).toContain("DTEND:20300108T180000Z\r\n");
    expect(body).toContain("SUMMARY:Corte — Studio Defendi\r\n");
    expect(body).toContain("LOCATION:Rua X\\, 120\r\n");
    expect(body).not.toContain(token);
  });

  it("token inválido ou agendamento cancelado: 404", async () => {
    expect((await call("token-que-nao-existe")).status).toBe(404);
    const token = await newBooking();
    await cancelByToken(db, token, NOW);
    expect((await call(token)).status).toBe(404);
  });
});
