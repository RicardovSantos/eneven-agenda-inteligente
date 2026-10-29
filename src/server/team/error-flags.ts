import type { TeamError } from "./errors";

/**
 * Flag de `?erro=` da página `/convite/{token}` para cada recusa do aceite.
 * Por código (nunca pelo texto da mensagem). `limite` (rate limit) e `google`
 * (falha do fluxo do Google) também são usados por quem barra antes do aceite.
 */
export function inviteErrorFlag(error: TeamError): string {
  switch (error.code) {
    case "wrong_account":
      return "conta";
    case "google_failed":
      return "google";
    case "already_member":
      return "membro";
    case "other_tenant":
      return "outro";
    case "rate_limited":
      return "limite";
    default:
      return "invalido";
  }
}
