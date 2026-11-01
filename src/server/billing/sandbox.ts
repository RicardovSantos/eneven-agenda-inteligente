type Env = Record<string, string | undefined>;

/**
 * Credencial de teste da Mercado Pago. Os tokens antigos de teste começam com
 * `TEST-`; as contas de teste atuais recebem tokens `APP_USR-` iguais aos de
 * produção, então esse formato só vale como teste com a liberação explícita
 * `MERCADO_PAGO_SANDBOX=true`, nunca em produção (e `assertSandboxAccount`
 * confirma que a conta dona é mesmo de teste antes de criar qualquer coisa).
 */
export function isSandboxAccessToken(token: string | undefined, env: Env = process.env): token is string {
  if (!token) return false;
  if (token.startsWith("TEST-")) return true;
  return env.NODE_ENV !== "production" && env.MERCADO_PAGO_SANDBOX === "true" && token.startsWith("APP_USR-");
}

/**
 * Tokens `APP_USR-` liberados como teste só passam se a conta dona for de teste
 * (apelido `TESTUSER…`) e for o vendedor configurado. Evita criar assinaturas
 * reais por engano com um token de produção em ambiente de desenvolvimento.
 */
export async function assertSandboxAccount(
  token: string,
  collectorId: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (token.startsWith("TEST-")) return;
  let account: unknown;
  try {
    const response = await fetcher("https://api.mercadopago.com/users/me", {
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!response.ok) throw new Error("falha");
    account = await response.json();
  } catch {
    throw new Error("Não foi possível confirmar a conta de teste.");
  }
  const body = account as { id?: unknown; nickname?: unknown } | null;
  if (
    !body ||
    typeof body !== "object" ||
    String(body.id ?? "") !== collectorId ||
    typeof body.nickname !== "string" ||
    !/^TESTUSER/i.test(body.nickname)
  ) {
    throw new Error("O token não é de uma conta de teste.");
  }
}
