import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tenants, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { AuthError } from "@/server/auth/errors";
import { signup } from "@/server/auth/signup";
import { generateUniqueSlug } from "@/server/tenants/slug";
import { createTestDb } from "../helpers/test-db";
import { getDefaultPlanId } from "@/server/platform/plans";

// O gerador de slug é trocado por um dublê para simular a corrida: ele
// devolve um slug que já foi ocupado entre a consulta e o INSERT.
vi.mock("@/server/tenants/slug", () => ({ generateUniqueSlug: vi.fn() }));
const slugMock = vi.mocked(generateUniqueSlug);

const input = {
  businessName: "Defendi Studio",
  ownerName: "Ana",
  email: "ana@defendi.com",
  password: "senha-forte-1",
  whatsapp: "11999999999",
};

describe("cadastro: colisão de slug por corrida", () => {
  let db: Db;

  beforeEach(async () => {
    slugMock.mockReset();
    db = await createTestDb();
    // Outro estabelecimento já ocupa "defendi-studio".
    await db.insert(tenants).values({ slug: "defendi-studio", name: "Outro", trialEndsAt: new Date(), planId: await getDefaultPlanId(db) });
  });

  it("slug ocupado uma vez: tenta de novo e cadastra com o slug livre", async () => {
    slugMock.mockResolvedValueOnce("defendi-studio").mockResolvedValueOnce("defendi-studio-2");

    const account = await signup(db, input);

    expect(account.slug).toBe("defendi-studio-2");
    expect(slugMock).toHaveBeenCalledTimes(2);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("slug ocupado duas vezes: ainda cadastra na terceira tentativa", async () => {
    slugMock
      .mockResolvedValueOnce("defendi-studio")
      .mockResolvedValueOnce("defendi-studio")
      .mockResolvedValueOnce("defendi-studio-3");

    const account = await signup(db, input);

    expect(account.slug).toBe("defendi-studio-3");
    expect(slugMock).toHaveBeenCalledTimes(3);
  });

  it("slug ocupado três vezes: erro 'unavailable' e nada fica gravado", async () => {
    slugMock.mockResolvedValue("defendi-studio");

    const error = await signup(db, input).then(
      () => null,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).code).toBe("unavailable");
    expect((error as AuthError).message).toMatch(/endereço da sua agenda/);
    expect(slugMock).toHaveBeenCalledTimes(3);
    expect(await db.select().from(users)).toHaveLength(0);
    expect(await db.select().from(tenants).where(eq(tenants.name, "Defendi Studio"))).toHaveLength(0);
  });
});
