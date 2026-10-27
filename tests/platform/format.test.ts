import { describe, expect, it } from "vitest";
import {
  auditText,
  formatLastSeen,
  formatLogTime,
  initialsOf,
  parseSituation,
  parsePage,
  situationLabel,
  situationWhen,
} from "@/lib/platform-format";

const NOW = new Date("2026-10-27T15:00:00Z"); // 12:00 em São Paulo
const DAY = 86_400_000;

describe("situação", () => {
  it("rótulos em português", () => {
    expect(situationLabel("trial")).toBe("Em teste");
    expect(situationLabel("trial_expired")).toBe("Teste vencido");
    expect(situationLabel("active")).toBe("Ativo");
    expect(situationLabel("past_due")).toBe("Pagamento atrasado");
    expect(situationLabel("read_only")).toBe("Somente leitura");
    expect(situationLabel("canceled")).toBe("Cancelado");
  });

  it("valida o parâmetro da URL: desconhecido vale como todos", () => {
    expect(parseSituation("trial")).toBe("trial");
    expect(parseSituation("trial_expired")).toBe("trial_expired");
    expect(parseSituation("canceled")).toBe("canceled");
    expect(parseSituation("drop table")).toBeUndefined();
    expect(parseSituation(undefined)).toBeUndefined();
    expect(parseSituation(["trial", "active"])).toBe("trial");
  });

  it("valida a página", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-4")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("999999999999")).toBe(1);
  });

  it("texto de prazo por situação", () => {
    const base = { activatedAt: null as Date | null };
    expect(situationWhen({ ...base, situation: "trial", trialEndsAt: new Date(NOW.getTime() + 2 * DAY - 1000) }, NOW)).toBe(
      "Termina em 2 dias",
    );
    expect(situationWhen({ ...base, situation: "trial", trialEndsAt: new Date(NOW.getTime() + 3600_000) }, NOW)).toBe(
      "Termina hoje",
    );
    expect(situationWhen({ ...base, situation: "trial", trialEndsAt: new Date(NOW.getTime() + DAY - 1000) }, NOW)).toBe(
      "Termina em 1 dia",
    );
    expect(
      situationWhen({ ...base, situation: "trial_expired", trialEndsAt: new Date("2026-10-22T15:00:00Z") }, NOW),
    ).toBe("Venceu em 22/10");
    expect(
      situationWhen(
        { situation: "active", trialEndsAt: NOW, activatedAt: new Date("2026-09-03T15:00:00Z") },
        NOW,
      ),
    ).toBe("Desde 03/09");
    expect(situationWhen({ ...base, situation: "read_only", trialEndsAt: NOW }, NOW)).toBeNull();
  });
});

describe("datas", () => {
  it("último acesso: hoje, ontem, outro dia e nunca", () => {
    expect(formatLastSeen(new Date("2026-10-27T12:12:00Z"), NOW)).toBe("Hoje, 09:12");
    expect(formatLastSeen(new Date("2026-10-26T22:05:00Z"), NOW)).toBe("Ontem, 19:05");
    expect(formatLastSeen(new Date("2026-10-25T00:10:00Z"), NOW)).toBe("24/10, 21:10");
    expect(formatLastSeen(null, NOW)).toBe("Nunca entrou");
  });

  it("horário do histórico em São Paulo", () => {
    expect(formatLogTime(new Date("2026-10-26T17:02:00Z"))).toBe("26/10, 14:02");
  });

  it("iniciais", () => {
    expect(initialsOf("Studio Aurora Piercing")).toBe("SA");
    expect(initialsOf("Barbearia")).toBe("BA");
    expect(initialsOf("  ")).toBe("?");
  });
});

describe("histórico", () => {
  const row = (action: string, details: unknown, actorName: string | null = "Ricardo") => ({
    id: 1,
    action,
    details,
    createdAt: new Date("2026-10-26T17:02:00Z"),
    actorName,
  });

  it("descreve cada ação conhecida", () => {
    expect(auditText(row("tenant.plan_changed", { from: "essencial", to: "profissional" }))).toBe(
      "Ricardo mudou o plano de Essencial para Profissional",
    );
    expect(auditText(row("tenant.trial_extended", { days: 7, to: "2026-11-05T15:00:00.000Z" }))).toBe(
      "Ricardo estendeu o teste em 7 dias (até 05/11)",
    );
    expect(auditText(row("tenant.activated", {}))).toBe("Ricardo ativou a assinatura");
    expect(auditText(row("tenant.blocked", {}))).toBe("Ricardo bloqueou o estabelecimento");
    expect(auditText(row("tenant.canceled", {}))).toBe("Ricardo cancelou a conta");
    expect(auditText(row("tenant.created_by_admin", { plan: "profissional", trialDays: 14 }))).toBe(
      "Ricardo criou o estabelecimento (plano Profissional, teste de 14 dias)",
    );
    expect(auditText(row("support.started", {}))).toBe("Ricardo entrou como o estabelecimento (suporte)");
    expect(auditText(row("support.ended", { minutes: 12 }))).toBe("Ricardo saiu do modo suporte (12 min)");
    expect(auditText(row("google_link", {}, "Marina"))).toBe("Marina ligou a conta ao Google");
  });

  it("sem ator e ação desconhecida não quebram", () => {
    expect(auditText(row("tenant.activated", {}, null))).toBe("A plataforma ativou a assinatura");
    expect(auditText(row("algo.novo", null))).toBe("Ricardo: algo.novo");
  });
});
