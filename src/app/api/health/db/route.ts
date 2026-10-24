import { getDb } from "@/db/client";
import { checkDatabase } from "@/server/health/db-check";

export const dynamic = "force-dynamic";

/** Prontidão: confere o banco (`select 1`, 2 s). A liveness do Docker é `/api/health`. */
export function GET(): Promise<Response> {
  return checkDatabase(getDb);
}
