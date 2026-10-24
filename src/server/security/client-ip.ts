import { headers } from "next/headers";
import { getClientIp } from "./rate-limit";

/** IP do cliente da requisição atual (Server Actions e rotas). */
export async function currentClientIp(): Promise<string> {
  return getClientIp(await headers());
}
