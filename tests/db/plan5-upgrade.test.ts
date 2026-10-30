import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { expect, it } from "vitest";
import * as schema from "@/db/schema";

it("atualiza banco existente até 0016 sem perder dados e aplica a cobrança", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "eneven-plan5-upgrade-"));
  const client = new PGlite({ extensions: { btree_gist } });
  try {
    const source = resolve("drizzle");
    const journal = JSON.parse(await readFile(join(source, "meta", "_journal.json"), "utf8")) as { entries: Array<{ idx: number; tag: string }> };
    const before = { ...journal, entries: journal.entries.filter((entry) => entry.idx <= 16) };
    expect(before.entries).toHaveLength(17);
    await mkdir(join(tempRoot, "meta"));
    await writeFile(join(tempRoot, "meta", "_journal.json"), JSON.stringify(before));
    for (const entry of before.entries) await copyFile(join(source, `${entry.tag}.sql`), join(tempRoot, `${entry.tag}.sql`));
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: tempRoot });
    const [plan] = await db.select().from(schema.plans).limit(1);
    const inserted = await client.query<{ id: string }>('insert into tenants (slug, name, plan_id, trial_ends_at) values ($1, $2, $3, $4) returning id', ["loja-upgrade", "Loja existente", plan.id, "2030-01-01T00:00:00Z"]);
    const tenant = inserted.rows[0];
    await migrate(db, { migrationsFolder: source });
    const saved = await db.select().from(schema.tenants);
    expect(saved).toMatchObject([{ id: tenant.id, name: "Loja existente", pastDueAt: null }]);
    expect(await db.select().from(schema.billingSubscriptions)).toEqual([]);
    expect(await db.select().from(schema.pushSubscriptions)).toEqual([]);
    const migrated = await client.query<{ n: string }>('select count(*)::text as n from drizzle.__drizzle_migrations');
    expect(Number(migrated.rows[0].n)).toBe(journal.entries.length);
  } finally {
    await client.close();
    if (!resolve(tempRoot).startsWith(`${resolve(tmpdir())}${sep}`)) throw new Error("Pasta temporária fora do local esperado.");
    await rm(tempRoot, { recursive: true, force: true });
  }
});
