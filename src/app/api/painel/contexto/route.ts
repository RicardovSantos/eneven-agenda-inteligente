import { getCurrentSession } from "@/server/auth/guard";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

/**
 * Em qual conta a sessão está AGORA (estabelecimento e modo suporte). O painel
 * compara com o que a aba carregou: o cookie é um só para todas as abas, então
 * entrar ou sair do suporte numa aba muda a conta de todas as outras.
 */
export async function GET(): Promise<Response> {
  const session = await getCurrentSession();
  if (!session?.tenantId || session.role === null) {
    return Response.json({ ok: false }, { status: 401, headers });
  }
  return Response.json({ ok: true, tenantId: session.tenantId, support: session.support }, { headers });
}
