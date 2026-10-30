import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { bookingManageTokens, bookings } from "@/db/schema";
import { hashToken } from "@/server/auth/session";
import { findBookingByManageToken, issueAdditionalManageToken } from "@/server/agenda/bookings";
import { withTenant } from "@/server/tenant-db";
import { seedBooking, seedTenant } from "../helpers/agenda-fixtures";
import { createTestDb } from "../helpers/test-db";

describe("links adicionais de gestão", () => {
  it("preserva link anterior, guarda apenas hash e respeita expiração", async () => {
    const db = await createTestDb();
    const tenant = await seedTenant(db);
    const booking = await seedBooking(db, tenant.id, { manageTokenHash: hashToken("original") });
    const token = await issueAdditionalManageToken(db, tenant.id, booking.id, new Date(Date.now() + 60_000));
    expect(await findBookingByManageToken(db, "original")).toMatchObject({ bookingId: booking.id });
    expect(await findBookingByManageToken(db, token)).toMatchObject({ bookingId: booking.id });
    const [row] = await withTenant(db, tenant.id, (tx) => tx.select().from(bookingManageTokens));
    expect(row.tokenHash).toBe(hashToken(token));
    await withTenant(db, tenant.id, (tx) => tx.update(bookingManageTokens).set({ expiresAt: new Date(0) }).where(eq(bookingManageTokens.tokenHash, row.tokenHash)));
    expect(await findBookingByManageToken(db, token)).toBeNull();
    await withTenant(db, tenant.id, (tx) => tx.delete(bookings).where(eq(bookings.id, booking.id)));
  });
  it("recusa emissão para agendamento de outro estabelecimento", async () => {
    const db = await createTestDb();
    const a = await seedTenant(db);
    const b = await seedTenant(db);
    const booking = await seedBooking(db, a.id);
    await expect(issueAdditionalManageToken(db, b.id, booking.id, new Date(Date.now() + 60_000))).rejects.toThrow();
  });
});
