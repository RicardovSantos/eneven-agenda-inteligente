import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { bookings, customers, memberships, professionals, users } from "@/db/schema";
import type { Db } from "@/db/types";
import type { PanelActor } from "@/server/agenda/panel-ops";
import { ClientError, createClient, updateClient, updateClientNotes } from "@/server/clients";
import { bookingValues } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";
import { seedBookable, type PublicSeed } from "../helpers/public-fixtures";

let db: Db;
let a: PublicSeed;
let owner: PanelActor;
let reception: PanelActor;

const rowOf = async (id: string) => (await db.select().from(customers).where(eq(customers.id, id)))[0];

beforeEach(async () => {
  db = await createTestDb();
  a = await seedBookable(db, { pros: 2 });
  owner = { tenantId: a.tenantId, userId: a.ownerId, role: "owner" };
  reception = { ...owner, role: "reception" };
});

describe("createClient", () => {
  it("cria com telefone normalizado e campos vazios viram nulo", async () => {
    const { id } = await createClient(db, reception, {
      name: "  Ana Souza ",
      phone: "(11) 98123-4321",
      email: "",
      notes: "  ",
    });
    expect(await rowOf(id)).toMatchObject({
      tenantId: a.tenantId,
      name: "Ana Souza",
      phone: "5511981234321",
      email: null,
      notes: null,
    });
  });

  it("telefone em outra máscara de um existente -> phone_taken com existingId", async () => {
    const { id } = await createClient(db, owner, { name: "Ana", phone: "(11) 98123-4321" });
    const err = await createClient(db, owner, { name: "Outra", phone: "+55 11 981234321" }).catch((e) => e);
    expect(err).toBeInstanceOf(ClientError);
    expect(err).toMatchObject({
      code: "phone_taken",
      message: "Já existe um cliente com esse WhatsApp.",
      existingId: id,
    });
  });

  it("valida nome, WhatsApp, e-mail e notas com mensagens por campo", async () => {
    const err = await createClient(db, owner, {
      name: " ",
      phone: "123",
      email: "nao-e-email",
      notes: "x".repeat(501),
    }).catch((e) => e);
    expect(err).toMatchObject({ code: "validation" });
    expect(Object.keys(err.fieldErrors).sort()).toEqual(["email", "name", "notes", "phone"]);
    await expect(createClient(db, owner, { name: "x".repeat(81), phone: "11981234321" })).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("mesmo telefone em outro estabelecimento é permitido", async () => {
    const b = await seedBookable(db);
    await createClient(db, owner, { name: "Ana", phone: "11981234321" });
    await expect(
      createClient(db, { tenantId: b.tenantId, userId: b.ownerId, role: "owner" }, { name: "Ana", phone: "11981234321" }),
    ).resolves.toHaveProperty("id");
  });

  it("staff não cria", async () => {
    const staff: PanelActor = { ...owner, role: "staff" };
    await expect(createClient(db, staff, { name: "Ana", phone: "11981234321" })).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("updateClient", () => {
  it("atualiza dados e troca de telefone", async () => {
    const { id } = await createClient(db, owner, { name: "Ana", phone: "11981234321" });
    await updateClient(db, reception, id, { name: "Ana B", phone: "(21) 99999-0000", email: "a@b.com", notes: "oi" });
    expect(await rowOf(id)).toMatchObject({ name: "Ana B", phone: "5521999990000", email: "a@b.com", notes: "oi" });
  });

  it("manter o próprio telefone não conflita; telefone de outro -> phone_taken", async () => {
    const { id } = await createClient(db, owner, { name: "Ana", phone: "11981234321" });
    const { id: other } = await createClient(db, owner, { name: "Bia", phone: "11955550000" });
    await expect(updateClient(db, owner, id, { name: "Ana", phone: "(11) 98123-4321" })).resolves.toBeUndefined();
    await expect(updateClient(db, owner, id, { name: "Ana", phone: "11955550000" })).rejects.toMatchObject({
      code: "phone_taken",
      existingId: other,
    });
  });

  it("not_found para id inválido ou de outro estabelecimento", async () => {
    const b = await seedBookable(db);
    const [foreign] = await db
      .insert(customers)
      .values({ tenantId: b.tenantId, name: "X", phone: "5511977770000" })
      .returning();
    for (const id of ["lixo", foreign.id]) {
      await expect(updateClient(db, owner, id, { name: "Y", phone: "11981234321" })).rejects.toMatchObject({
        code: "not_found",
      });
    }
    expect((await rowOf(foreign.id)).name).toBe("X");
  });

  it("staff não edita", async () => {
    const { id } = await createClient(db, owner, { name: "Ana", phone: "11981234321" });
    await expect(
      updateClient(db, { ...owner, role: "staff" }, id, { name: "Z", phone: "11981234321" }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("updateClientNotes", () => {
  it("todos os papéis dentro do escopo; staff só de cliente que atendeu", async () => {
    const { id } = await createClient(db, owner, { name: "Ana", phone: "11981234321" });
    await updateClientNotes(db, reception, id, "  prefere manhã ");
    expect((await rowOf(id)).notes).toBe("prefere manhã");

    const [user] = await db
      .insert(users)
      .values({ email: "leo@exemplo.com", name: "Léo", emailVerifiedAt: new Date() })
      .returning();
    await db.insert(memberships).values({ userId: user.id, tenantId: a.tenantId, role: "staff" });
    await db.update(professionals).set({ userId: user.id }).where(eq(professionals.id, a.proIds[1]));
    const staff: PanelActor = { tenantId: a.tenantId, userId: user.id, role: "staff" };

    await expect(updateClientNotes(db, staff, id, "x")).rejects.toMatchObject({ code: "not_found" });
    await db.insert(bookings).values(bookingValues(a.tenantId, a.proIds[1], id));
    await updateClientNotes(db, staff, id, "da Léo");
    expect((await rowOf(id)).notes).toBe("da Léo");
    await updateClientNotes(db, staff, id, "");
    expect((await rowOf(id)).notes).toBeNull();
  });

  it("notas acima de 500 -> validation", async () => {
    const { id } = await createClient(db, owner, { name: "Ana", phone: "11981234321" });
    await expect(updateClientNotes(db, owner, id, "x".repeat(501))).rejects.toMatchObject({
      code: "validation",
    });
  });
});
