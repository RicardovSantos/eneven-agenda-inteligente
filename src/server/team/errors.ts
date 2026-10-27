export type TeamErrorCode =
  | "forbidden"
  | "validation"
  | "already_member"
  | "other_tenant"
  | "invalid_invitation"
  | "wrong_account"
  | "not_found"
  | "rate_limited";

const MESSAGES: Record<TeamErrorCode, string> = {
  forbidden: "Você não tem permissão para fazer isso.",
  validation: "Confira os dados informados.",
  already_member: "Essa pessoa já tem acesso.",
  other_tenant: "Esse e-mail já está ligado a outro estabelecimento.",
  invalid_invitation: "Este convite não vale mais. Peça um novo a quem convidou você.",
  wrong_account: "Entre com a conta do e-mail convidado para aceitar.",
  not_found: "Não encontrado.",
  rate_limited: "Você enviou convites demais por hoje. Tente de novo amanhã.",
};

/** Erro de domínio dos acessos da equipe, com mensagem pronta para a interface (pt-BR). */
export class TeamError extends Error {
  readonly code: TeamErrorCode;
  /** `validation`: mensagem por campo (`name`, `email`, `role`, `professionalId`, `password`). */
  readonly fieldErrors?: Record<string, string>;

  constructor(code: TeamErrorCode, message?: string, fieldErrors?: Record<string, string>) {
    super(message ?? MESSAGES[code]);
    this.name = "TeamError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

/** "Entre com {e-mail} para aceitar." */
export const wrongAccount = (email: string) =>
  new TeamError("wrong_account", `Entre com ${email} para aceitar.`);

/** Formato de UUID (confere o texto antes de ir ao banco, que falharia com erro cru). */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
