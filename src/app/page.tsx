import { redirect } from "next/navigation";
import { getCurrentSession, homePathFor } from "@/server/auth/guard";

/** A raiz não tem conteúdo próprio: quem já entrou vai ao seu painel; os demais, a `/entrar`. */
export default async function Home() {
  redirect(homePathFor(await getCurrentSession()) ?? "/entrar");
}
