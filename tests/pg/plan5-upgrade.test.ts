import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { expect, it } from "vitest";
import * as schema from "@/db/schema";

it("atualiza banco PostgreSQL existente sem perder dados", async () => {
  const configured = process.env.TEST_DATABASE_URL;
  if (!configured || !new URL(configured).pathname.toLowerCase().includes("test")) throw new Error("Banco de teste obrigatório.");
  const name = `eneven_upgrade_test_${randomBytes(6).toString("hex")}`;
  if (!/^eneven_upgrade_test_[a-f0-9]{12}$/.test(name)) throw new Error("Nome de banco inválido.");
  const admin = postgres(configured, { max: 1, onnotice: () => {} });
  const tempRoot = await mkdtemp(join(tmpdir(), "eneven-pg-upgrade-"));
  let client: ReturnType<typeof postgres> | undefined;
  let created = false;
  try {
    await admin.unsafe(`create database "${name}"`); created = true;
    const url = new URL(configured); url.pathname = `/${name}`;
    client = postgres(url.toString(), { max: 1, onnotice: () => {} });
    const db = drizzle(client, { schema });
    const source = resolve("drizzle");
    const journal = JSON.parse(await readFile(join(source, "meta", "_journal.json"), "utf8")) as { entries: Array<{ idx: number; tag: string }> };
    const before = { ...journal, entries: journal.entries.filter((entry) => entry.idx <= 16) };
    expect(before.entries).toHaveLength(17);
    await mkdir(join(tempRoot, "meta"));
    await writeFile(join(tempRoot, "meta", "_journal.json"), JSON.stringify(before));
    for (const entry of before.entries) await copyFile(join(source, `${entry.tag}.sql`), join(tempRoot, `${entry.tag}.sql`));
    await migrate(db, { migrationsFolder: tempRoot });
    const [plan] = await db.select().from(schema.plans).limit(1);
    const [tenant] = await client`insert into tenants (slug, name, plan_id, trial_ends_at) values ('loja-upgrade', 'Loja existente', ${plan.id}, '2030-01-01T00:00:00Z') returning id`;
    await migrate(db, { migrationsFolder: source });
    expect(await db.select().from(schema.tenants)).toMatchObject([{ id: tenant.id, name: "Loja existente", pastDueAt: null }]);
    expect(await db.select().from(schema.billingSubscriptions)).toEqual([]);
    expect(await db.select().from(schema.pushSubscriptions)).toEqual([]);
    const [count] = await client`select count(*)::int as n from drizzle.__drizzle_migrations`;
    expect(count.n).toBe(journal.entries.length);
  } finally {
    if (client) await client.end();
    if (created) await admin.unsafe(`drop database "${name}"`);
    await admin.end();
    if (!resolve(tempRoot).startsWith(`${resolve(tmpdir())}${sep}`)) throw new Error("Pasta temporária fora do local esperado.");
    await rm(tempRoot, { recursive: true, force: true });
  }
});
