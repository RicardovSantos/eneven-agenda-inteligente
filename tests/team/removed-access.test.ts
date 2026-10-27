import { beforeEach, describe, expect, it } from "vitest";
import { memberships, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { canAccessTenantPanel } from "@/server/auth/guard";
import { createSession, getSession } from "@/server/auth/session";
import { removeMember } from "@/server/team/members";
import { createTestDb } from "../helpers/test-db";
import { seedOwnerTenant } from "../helpers/team-fixtures";

describe("acesso removido", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("a sessão que sobrar depois de removeMember não abre o painel (o guard manda para /entrar)", async () => {
    const owner = await seedOwnerTenant(db, "Studio A", "dona@a.com");
    const other = await seedOwnerTenant(db, "Studio B", "dona@b.com");
    const [member] = await db
      .insert(users)
      .values({ email: "rita@a.com", name: "Rita", passwordHash: null, emailVerifiedAt: new Date() })
      .returning({ id: users.id });
    await db
      .insert(memberships)
      .values({ userId: member.id, tenantId: owner.tenantId, role: "reception" });

    const inTenant = await createSession(db, member.id, owner.tenantId);
    const withoutTenant = await createSession(db, member.id, null);
    const inOtherTenant = await createSession(db, member.id, other.tenantId);
    expect(canAccessTenantPanel(await getSession(db, inTenant))).toBe(true);

    await removeMember(db, owner.actor, member.id);

    // A sessão do tenant é apagada; as demais (criadas à mão) não dão painel.
    expect(await getSession(db, inTenant)).toBeNull();
    for (const token of [withoutTenant, inOtherTenant]) {
      expect(canAccessTenantPanel(await getSession(db, token))).toBe(false);
    }
  });
});
