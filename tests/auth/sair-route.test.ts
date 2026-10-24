import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { createSession, hashToken } from "@/server/auth/session";
import { signup } from "@/server/auth/signup";
import { createTestDb } from "../helpers/test-db";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({ getDb: async () => state.db }));

const HOST = "agenda.eneven.com.br";

function request(options: { origin?: string | null; host?: string; token?: string }) {
  const headers: Record<string, string> = { host: options.host ?? HOST };
  if (options.origin !== null && options.origin !== undefined) headers.origin = options.origin;
  if (options.token) headers.cookie = `ea_session=${options.token}`;
  return new NextRequest(`http://interno:3000/sair`, { method: "POST", headers });
}

describe("POST /sair", () => {
  let db: Db;
  let token: string;
  let route: typeof import("@/app/sair/route");

  const sessionExists = async () =>
    (await db.select().from(sessions).where(eq(sessions.id, hashToken(token)))).length === 1;

  beforeEach(async () => {
    db = await createTestDb();
    state.db = db;
    const account = await signup(db, {
      businessName: "Defendi Studio",
      ownerName: "Ana",
      email: "ana@defendi.com",
      password: "senha-forte-1",
      whatsapp: "11999999999",
    });
    token = await createSession(db, account.userId, account.tenantId);
    route = await import("@/app/sair/route");
  });

  it("com Origin igual ao host: apaga a sessão e o cookie e vai para /entrar", async () => {
    const response = await route.POST(request({ origin: `https://${HOST}`, token }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/entrar");
    expect(response.cookies.get("ea_session")).toMatchObject({ value: "", maxAge: 0 });
    expect(await sessionExists()).toBe(false);
  });

  it("Origin de outro site: 403 e a sessão continua", async () => {
    const response = await route.POST(request({ origin: "https://site-malvado.example", token }));
    expect(response.status).toBe(403);
    expect(await sessionExists()).toBe(true);
    expect(response.cookies.get("ea_session")).toBeUndefined();
  });

  it("sem Origin: 403 e a sessão continua", async () => {
    const response = await route.POST(request({ token }));
    expect(response.status).toBe(403);
    expect(await sessionExists()).toBe(true);
  });

  it("Origin ilegível (\"null\"): 403", async () => {
    const response = await route.POST(request({ origin: "null", token }));
    expect(response.status).toBe(403);
    expect(await sessionExists()).toBe(true);
  });

  it("compara o host, não só o domínio: porta diferente é outro site", async () => {
    const response = await route.POST(
      request({ origin: `https://${HOST}:8443`, host: HOST, token }),
    );
    expect(response.status).toBe(403);
  });

  it("em desenvolvimento (localhost:3000) o Origin com porta confere com o Host", async () => {
    const response = await route.POST(
      request({ origin: "http://localhost:3000", host: "localhost:3000", token }),
    );
    expect(response.status).toBe(303);
    expect(await sessionExists()).toBe(false);
  });

  it("GET nunca desloga", async () => {
    const response = route.GET();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/painel");
    expect(await sessionExists()).toBe(true);
  });
});
