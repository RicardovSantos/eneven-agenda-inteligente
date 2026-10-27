import type { TenantSituation } from "@/server/tenants/release";

/**
 * Textos e validações das telas da plataforma (`/admin`). Funções puras: o
 * dono da plataforma vê tudo no horário de São Paulo.
 */

const TZ = "America/Sao_Paulo";
const DAY_MS = 86_400_000;

export const SITUATIONS: readonly TenantSituation[] = [
  "trial",
  "trial_expired",
  "active",
  "past_due",
  "read_only",
  "canceled",
];

const LABELS: Record<TenantSituation, string> = {
  trial: "Em teste",
  trial_expired: "Teste vencido",
  active: "Ativo",
  past_due: "Pagamento atrasado",
  read_only: "Somente leitura",
  canceled: "Cancelado",
};

export const situationLabel = (situation: TenantSituation) => LABELS[situation];

/** Filtros da lista, na ordem do mockup (o "Teste vencido" fica dentro de "Em teste"). */
export const FILTERS: ReadonlyArray<{ value: TenantSituation | undefined; label: string }> = [
  { value: undefined, label: "Todos" },
  { value: "trial", label: "Em teste" },
  { value: "active", label: "Ativos" },
  { value: "past_due", label: "Pagamento atrasado" },
  { value: "read_only", label: "Somente leitura" },
  { value: "canceled", label: "Cancelados" },
];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** `?situacao=`: valor desconhecido vale como "todos". */
export function parseSituation(value: string | string[] | undefined): TenantSituation | undefined {
  const raw = first(value);
  return SITUATIONS.find((s) => s === raw);
}

/** `?pagina=`: inteiro positivo razoável; senão 1. */
export function parsePage(value: string | string[] | undefined): number {
  const n = Number(first(value));
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : 1;
}

/** `?q=`: texto cortado em 100 caracteres. */
export function parseQuery(value: string | string[] | undefined): string {
  return (first(value) ?? "").trim().slice(0, 100);
}

const dayMonth = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ });
const hourMinute = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TZ,
});
const fullDate = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: TZ,
});
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

export const formatDayMonthBR = (date: Date) => dayMonth.format(date);
export const formatFullDateBR = (date: Date) => fullDate.format(date);

/** "26/10, 14:02" (histórico). */
export const formatLogTime = (date: Date) => `${dayMonth.format(date)}, ${hourMinute.format(date)}`;

/** "Hoje, 09:12", "Ontem, 19:05", "24/10, 21:10" ou "Nunca entrou". */
export function formatLastSeen(date: Date | null, now: Date = new Date()): string {
  if (!date) return "Nunca entrou";
  const key = dayKey.format(date);
  const time = hourMinute.format(date);
  if (key === dayKey.format(now)) return `Hoje, ${time}`;
  if (key === dayKey.format(new Date(now.getTime() - DAY_MS))) return `Ontem, ${time}`;
  return `${dayMonth.format(date)}, ${time}`;
}

/** Linha de apoio sob a situação ("Termina em 2 dias", "Venceu em 22/10"), ou `null`. */
export function situationWhen(
  tenant: { situation: TenantSituation; trialEndsAt: Date; activatedAt: Date | null },
  now: Date = new Date(),
): string | null {
  switch (tenant.situation) {
    case "trial": {
      const hours = (tenant.trialEndsAt.getTime() - now.getTime()) / 3_600_000;
      if (hours <= 24 && dayKey.format(tenant.trialEndsAt) === dayKey.format(now)) return "Termina hoje";
      const days = Math.max(1, Math.ceil(hours / 24));
      return `Termina em ${days} ${days === 1 ? "dia" : "dias"}`;
    }
    case "trial_expired":
      return `Venceu em ${dayMonth.format(tenant.trialEndsAt)}`;
    case "active":
      return tenant.activatedAt ? `Desde ${dayMonth.format(tenant.activatedAt)}` : null;
    default:
      return null;
  }
}

/** Duas letras para o selo do estabelecimento. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const AVATAR_COLORS = ["#0E7C86", "#B4237A", "#2F6FDB", "#8A5A00"];

/** Cor do selo, estável por estabelecimento (as mesmas cores dos profissionais). */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
const asText = (value: unknown) => (typeof value === "string" ? value : "");
const asNumber = (value: unknown) => (typeof value === "number" ? value : 0);

export type AuditRow = {
  id: number;
  action: string;
  details: unknown;
  createdAt: Date;
  actorName: string | null;
};

/** Frase do histórico: "Ricardo mudou o plano de Essencial para Profissional". */
export function auditText(row: AuditRow): string {
  const actor = row.actorName ?? "A plataforma";
  const d = asRecord(row.details);
  switch (row.action) {
    case "tenant.plan_changed":
      return `${actor} mudou o plano de ${capitalize(asText(d.from))} para ${capitalize(asText(d.to))}`;
    case "tenant.trial_extended": {
      const days = asNumber(d.days);
      const until = asText(d.to);
      const when = until ? ` (até ${dayMonth.format(new Date(until))})` : "";
      return `${actor} estendeu o teste em ${days} ${days === 1 ? "dia" : "dias"}${when}`;
    }
    case "tenant.activated":
      return `${actor} ativou a assinatura`;
    case "tenant.blocked":
      return `${actor} bloqueou o estabelecimento`;
    case "tenant.canceled":
      return `${actor} cancelou a conta`;
    case "tenant.created_by_admin": {
      const days = asNumber(d.trialDays);
      return `${actor} criou o estabelecimento (plano ${capitalize(asText(d.plan))}, teste de ${days} ${days === 1 ? "dia" : "dias"})`;
    }
    case "support.started":
      return `${actor} entrou como o estabelecimento (suporte)`;
    case "support.ended":
      return `${actor} saiu do modo suporte (${asNumber(d.minutes)} min)`;
    case "google_link":
      return `${actor} ligou a conta ao Google`;
    default:
      return `${actor}: ${row.action}`;
  }
}
