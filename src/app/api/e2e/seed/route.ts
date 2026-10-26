import { getDb } from "@/db/client";
import {
  e2eSeedAllowed,
  listE2eBookings,
  seedE2eBlock,
  seedE2eBooking,
  seedE2eSession,
  seedE2eTenant,
  type SeedBlockOptions,
  type SeedBookingOptions,
  type SeedTenantOptions,
} from "@/server/e2e/seed";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

/**
 * Apoio do Playwright (`pnpm test:e2e`): cria estabelecimentos e agendamentos
 * no PGlite de desenvolvimento. Responde 404 a qualquer chamada, a menos que
 * `E2E_SEED` esteja definido, o processo não seja de produção e o cabeçalho
 * `x-e2e-seed` traga o mesmo segredo.
 */
export async function POST(request: Request): Promise<Response> {
  if (!e2eSeedAllowed(request.headers)) return notFound();

  const body = (await request.json()) as { action?: string } & Record<string, unknown>;
  const db = await getDb();
  switch (body.action) {
    case "tenant":
      return Response.json(await seedE2eTenant(db, body as SeedTenantOptions));
    case "booking":
      return Response.json(await seedE2eBooking(db, body as unknown as SeedBookingOptions));
    case "block":
      return Response.json(await seedE2eBlock(db, body as unknown as SeedBlockOptions));
    case "session":
      return Response.json(await seedE2eSession(db, String(body.slug)));
    case "bookings":
      return Response.json(await listE2eBookings(db, String(body.slug)));
    default:
      return Response.json({ error: "ação desconhecida" }, { status: 400 });
  }
}
