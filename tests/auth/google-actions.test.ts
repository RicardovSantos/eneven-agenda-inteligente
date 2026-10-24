import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { oauthAccounts, sessions, users } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  GOOGLE_PENDING_PURPOSE,
  signPendingProfile,
  type GoogleProfile,
} from "@/server/auth/google";
import { hashToken } from "@/server/auth/session";
import { signValue } from "@/server/auth/signed-cookie";
import { signup } from "@/server/auth/signup";
import { createTestDb } from "../helpers/test-db";

// --- dublês do ambiente Next ---
const state = vi.hoisted(() => ({
  db: undefined as unknown,
  jar: new Map<string, string>(),
  sets: [] as Array<{ name: string; value: string; options: Record<string, unknown> }>,
}));

vi.mock("@/db/client", () => ({ getDb: async () => state.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.jar.has(name) ? { value: state.jar.get(name) } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      state.sets.push({ name, value, options });
      if (value === "") state.jar.delete(name);
      else state.jar.set(name, value);
    },
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

const profile: GoogleProfile = {
  sub: "google-sub-9",
  email: "bia@gmail.com",
  emailVerified: true,
  name: "Bia Lima",
  picture: null,
};

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

const redirectOf = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e as Error,
  );
  return error?.message ?? null;
};

describe("server actions do Google", () => {
  let db: Db;
  let actions: typeof import("@/app/(auth)/google-actions");

  beforeEach(async () => {
    vi.stubEnv("SESSION_SECRET", "segredo-de-teste-segredo-de-teste-1234");
    vi.resetModules();
    db = await createTestDb();
    state.db = db;
    state.jar = new Map([["ea_google_pending", signPendingProfile(profile)]]);
    state.sets = [];
    actions = await import("@/app/(auth)/google-actions");
  });

  const valid = { businessName: "Studio Bela", whatsapp: "(11) 98888-7777" };

  it("cria a conta, abre a sessão, apaga o cookie pendente e vai para o painel", async () => {
    const result = await redirectOf(actions.completeGoogleSignupAction({}, form(valid)));
    expect(result).toBe("NEXT_REDIRECT:/painel");

    const [user] = await db.select().from(users);
    expect(user).toMatchObject({ email: "bia@gmail.com", name: "Bia Lima", passwordHash: null });
    expect(await db.select().from(oauthAccounts)).toHaveLength(1);

    const session = state.sets.find((s) => s.name === "ea_session");
    expect(session?.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    const [row] = await db.select().from(sessions).where(eq(sessions.id, hashToken(session!.value)));
    expect(row.userId).toBe(user.id);
    expect(row.tenantId).not.toBeNull();

    const cleared = state.sets.find((s) => s.name === "ea_google_pending");
    expect(cleared).toMatchObject({ value: "", options: { maxAge: 0 } });
  });

  it("sem cookie pendente (ou adulterado/vencido) volta ao cadastro sem criar nada", async () => {
    for (const value of [
      null,
      "lixo",
      signValue(profile, -1, GOOGLE_PENDING_PURPOSE),
      signValue({ sub: "x" }, 900, GOOGLE_PENDING_PURPOSE),
    ]) {
      state.jar.clear();
      if (value) state.jar.set("ea_google_pending", value);
      expect(await redirectOf(actions.completeGoogleSignupAction({}, form(valid)))).toBe(
        "NEXT_REDIRECT:/cadastro",
      );
    }
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("dados inválidos: erros por campo e o cookie pendente continua", async () => {
    const result = await actions.completeGoogleSignupAction(
      {},
      form({ businessName: "", whatsapp: "1" }),
    );
    expect(result.fieldErrors).toEqual({
      businessName: "Informe o nome do estabelecimento.",
      whatsapp: "Informe um WhatsApp com DDD.",
    });
    expect(state.jar.has("ea_google_pending")).toBe(true);
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("se a conta já passou a existir (duplo envio), só entra", async () => {
    await redirectOf(actions.completeGoogleSignupAction({}, form(valid)));
    state.jar.set("ea_google_pending", signPendingProfile(profile));
    state.sets = [];
    expect(await redirectOf(actions.completeGoogleSignupAction({}, form(valid)))).toBe(
      "NEXT_REDIRECT:/painel",
    );
    expect(await db.select().from(users)).toHaveLength(1);
    expect(state.sets.some((s) => s.name === "ea_session")).toBe(true);
  });

  it("e-mail que já tem conta com senha: entra nela (vincula o Google)", async () => {
    const ana = await signup(db, {
      businessName: "Outro",
      ownerName: "Bia",
      email: "bia@gmail.com",
      password: "senha-forte-1",
      whatsapp: "11999999999",
    });
    expect(await redirectOf(actions.completeGoogleSignupAction({}, form(valid)))).toBe(
      "NEXT_REDIRECT:/painel",
    );
    const [link] = await db.select().from(oauthAccounts);
    expect(link.userId).toBe(ana.userId);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("'Usar outra conta' apaga o cookie pendente e vai para o cadastro", async () => {
    expect(await redirectOf(actions.discardGooglePendingAction())).toBe("NEXT_REDIRECT:/cadastro");
    expect(state.jar.has("ea_google_pending")).toBe(false);
  });
});
