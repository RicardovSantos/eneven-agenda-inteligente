import { describe, expect, it } from "vitest";
import {
  getAvailableDates,
  getAvailableSlots,
  pickProfessional,
  type AvailabilityInput,
  type Slot,
  type TimeRange,
  type WeeklyHours,
} from "@/server/agenda/availability";

const SP = "America/Sao_Paulo";
const NOW = new Date("2026-10-27T12:00:00-03:00");

const workday: TimeRange[] = [
  { start: "09:00", end: "12:00" },
  { start: "13:00", end: "19:00" },
];
function week(days: Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, TimeRange[]>>): WeeklyHours {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], ...days };
}
const monSat = week({ 1: workday, 2: workday, 3: workday, 4: workday, 5: workday, 6: workday });

const at = (date: string, hm: string) => new Date(`${date}T${hm}:00-03:00`);

function base(over: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    date: "2026-10-28",
    timezone: SP,
    now: NOW,
    rules: { slotIntervalMin: 15, minNoticeMin: 60, maxDaysAhead: 60 },
    businessHours: monSat,
    professionals: [{ id: "A", hours: monSat }],
    blocks: [],
    busy: [],
    durationMin: 30,
    bufferAfterMin: 0,
    ...over,
  };
}

/** Horários de início em HH:mm no fuso de São Paulo. */
function starts(slots: Slot[]): string[] {
  return slots.map((s) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: SP,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(s.startsAt),
  );
}

describe("getAvailableSlots - grade e almoço", () => {
  it("30 min em 28/10: primeiro 09:00, último 18:30, sem atravessar o almoço", () => {
    const list = starts(getAvailableSlots(base()));
    expect(list[0]).toBe("09:00");
    expect(list.at(-1)).toBe("18:30");
    expect(list).toContain("11:30");
    expect(list).not.toContain("11:45");
    expect(list).not.toContain("12:00");
    expect(list).not.toContain("12:45");
    expect(list).toContain("13:00");
  });

  it("endsAt = início + duração e blockedUntil = endsAt + buffer", () => {
    const [first] = getAvailableSlots(base({ durationMin: 40, bufferAfterMin: 10 }));
    expect(first.startsAt).toEqual(at("2026-10-28", "09:00"));
    expect(first.endsAt).toEqual(at("2026-10-28", "09:40"));
    expect(first.blockedUntil).toEqual(at("2026-10-28", "09:50"));
  });

  it("40 min + buffer 10: 11:15 não existe, 11:00 existe", () => {
    const list = starts(getAvailableSlots(base({ durationMin: 40, bufferAfterMin: 10 })));
    expect(list).toContain("11:00");
    expect(list).not.toContain("11:15");
  });

  it("o buffer precisa caber antes do fechamento (último = 18:00 com 40+10 min)", () => {
    const list = starts(getAvailableSlots(base({ durationMin: 40, bufferAfterMin: 10 })));
    expect(list.at(-1)).toBe("18:00");
  });

  it("a grade ancora no início de cada intervalo de trabalho", () => {
    const odd = week({ 3: [{ start: "13:10", end: "15:00" }] });
    const list = starts(
      getAvailableSlots(base({ businessHours: odd, professionals: [{ id: "A", hours: odd }] })),
    );
    expect(list).toEqual(["13:10", "13:25", "13:40", "13:55", "14:10", "14:25"]);
  });

  it("usa a interseção entre estabelecimento e profissional", () => {
    const prof = week({
      3: [
        { start: "10:00", end: "11:00" },
        { start: "17:00", end: "21:00" },
      ],
    });
    const list = starts(
      getAvailableSlots(base({ professionals: [{ id: "A", hours: prof }], durationMin: 60 })),
    );
    expect(list).toEqual(["10:00", "17:00", "17:15", "17:30", "17:45", "18:00"]);
  });
});

describe("getAvailableSlots - antecedência e janela", () => {
  it("hoje: nada antes de 13:00 (now 12:00 + 60 min); 13:00 existe", () => {
    const list = starts(getAvailableSlots(base({ date: "2026-10-27" })));
    expect(list[0]).toBe("13:00");
  });

  it("antecedência é inclusiva no limite e exclui 1 minuto antes", () => {
    const now = new Date("2026-10-27T12:01:00-03:00");
    const list = starts(getAvailableSlots(base({ date: "2026-10-27", now })));
    expect(list[0]).toBe("13:15");
  });

  it("domingo fechado -> []", () => {
    expect(getAvailableSlots(base({ date: "2026-11-01" }))).toEqual([]);
  });

  it("61 dias à frente -> []; 60 dias ainda tem horários", () => {
    expect(getAvailableSlots(base({ date: "2026-12-27" }))).toEqual([]);
    expect(getAvailableSlots(base({ date: "2026-12-26" })).length).toBeGreaterThan(0);
  });

  it("data anterior ao hoje local -> []", () => {
    expect(getAvailableSlots(base({ date: "2026-10-26" }))).toEqual([]);
  });

  it("hoje é o dia local do tenant, não o UTC (23:30 em SP já é dia seguinte em UTC)", () => {
    const now = new Date("2026-10-27T23:30:00-03:00"); // 2026-10-28T02:30Z
    expect(getAvailableSlots(base({ date: "2026-10-27", now }))).toEqual([]);
    const next = getAvailableSlots(base({ date: "2026-10-28", now }));
    expect(starts(next)[0]).toBe("09:00");
  });
});

describe("getAvailableSlots - ocupados e bloqueios", () => {
  const busy40 = [
    {
      professionalId: "A",
      startsAt: at("2026-10-28", "14:00"),
      blockedUntil: at("2026-10-28", "14:40"),
    },
  ];

  it("ocupado 14:00-14:40: 13:30 existe, 13:45 não, 14:30 não, 14:45 existe", () => {
    const list = starts(getAvailableSlots(base({ busy: busy40 })));
    expect(list).toContain("13:30");
    expect(list).not.toContain("13:45");
    expect(list).not.toContain("14:00");
    expect(list).not.toContain("14:30");
    expect(list).toContain("14:45");
  });

  it("extremos encostando não colidem", () => {
    const exact = [
      {
        professionalId: "A",
        startsAt: at("2026-10-28", "14:00"),
        blockedUntil: at("2026-10-28", "14:30"),
      },
    ];
    const list = starts(getAvailableSlots(base({ busy: exact })));
    expect(list).toContain("13:30");
    expect(list).toContain("14:30");
  });

  it("o buffer do novo atendimento também colide com o seguinte", () => {
    const list = starts(getAvailableSlots(base({ busy: busy40, bufferAfterMin: 10 })));
    expect(list).toContain("13:15"); // 13:15-13:55 não encosta em 14:00
    expect(list).not.toContain("13:30"); // 13:30-14:10 invade 14:00
  });

  it("ocupado de outro profissional não afeta o profissional A", () => {
    const other = [{ ...busy40[0], professionalId: "B" }];
    expect(starts(getAvailableSlots(base({ busy: other })))).toContain("14:00");
  });

  const profs = [
    { id: "A", hours: monSat },
    { id: "B", hours: monSat },
  ];
  const at15 = { startsAt: at("2026-10-28", "15:00"), endsAt: at("2026-10-28", "16:00") };

  it("bloqueio geral remove 15:00 para todos", () => {
    const slots = getAvailableSlots(
      base({ professionals: profs, blocks: [{ professionalId: null, ...at15 }] }),
    );
    expect(starts(slots)).not.toContain("15:00");
    expect(starts(slots)).toContain("16:00");
    expect(starts(slots)).toContain("14:30"); // 14:30-15:00 encosta, não colide
  });

  it("bloqueio só do profissional A mantém 15:00 com [B]", () => {
    const slots = getAvailableSlots(
      base({ professionals: profs, blocks: [{ professionalId: "A", ...at15 }] }),
    );
    const s = slots.find((x) => starts([x])[0] === "15:00");
    expect(s?.professionalIds).toEqual(["B"]);
  });

  it("bloqueio de dia inteiro zera a agenda", () => {
    const day = {
      professionalId: null,
      startsAt: at("2026-10-28", "00:00"),
      endsAt: at("2026-10-29", "00:00"),
    };
    expect(getAvailableSlots(base({ blocks: [day] }))).toEqual([]);
  });
});

describe("getAvailableSlots - vários profissionais", () => {
  it("expedientes diferentes: professionalIds correto, na ordem de entrada", () => {
    const morning = week({ 3: [{ start: "09:00", end: "12:00" }] });
    const afternoon = week({
      3: [
        { start: "10:00", end: "12:00" },
        { start: "13:00", end: "19:00" },
      ],
    });
    const slots = getAvailableSlots(
      base({
        professionals: [
          { id: "B", hours: afternoon },
          { id: "A", hours: morning },
        ],
      }),
    );
    const byStart = new Map(slots.map((s) => [starts([s])[0], s.professionalIds]));
    expect(byStart.get("09:00")).toEqual(["A"]);
    expect(byStart.get("10:00")).toEqual(["B", "A"]);
    expect(byStart.get("13:00")).toEqual(["B"]);
    expect(byStart.has("12:00")).toBe(false);
  });

  it("sem profissionais -> []; saída ordenada por início", () => {
    expect(getAvailableSlots(base({ professionals: [] }))).toEqual([]);
    const times = getAvailableSlots(base()).map((s) => s.startsAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});

describe("getAvailableSlots - validação e fuso da máquina", () => {
  it("duração <= 0 ou passo <= 0 lançam erro", () => {
    expect(() => getAvailableSlots(base({ durationMin: 0 }))).toThrow();
    expect(() => getAvailableSlots(base({ durationMin: -5 }))).toThrow();
    expect(() =>
      getAvailableSlots(base({ rules: { slotIntervalMin: 0, minNoticeMin: 0, maxDaysAhead: 5 } })),
    ).toThrow();
  });

  it("não depende do fuso do processo: now em offsets diferentes dá o mesmo resultado", () => {
    const a = getAvailableSlots(base({ now: new Date("2026-10-27T12:00:00-03:00") }));
    const b = getAvailableSlots(base({ now: new Date("2026-10-27T15:00:00Z") }));
    const c = getAvailableSlots(base({ now: new Date("2026-10-28T01:00:00+10:00") }));
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    // 09:00 em SP é 12:00Z independentemente de process.env.TZ
    expect(a[0].startsAt.toISOString()).toBe("2026-10-28T12:00:00.000Z");
  });

  it("outro fuso de tenant: 09:00 em Nova York", () => {
    const [first] = getAvailableSlots(
      base({
        timezone: "America/New_York",
        date: "2026-10-28",
        now: new Date("2026-10-27T12:00:00Z"),
      }),
    );
    expect(first.startsAt.toISOString()).toBe("2026-10-28T13:00:00.000Z");
  });
});

describe("getAvailableDates", () => {
  const { date, ...noDate } = base();
  void date;

  it("lista dias com horário, pulando domingo, a partir de from", () => {
    expect(getAvailableDates(noDate, "2026-10-30", 5)).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-02",
      "2026-11-03",
    ]);
  });

  it("respeita a janela de dias à frente", () => {
    expect(getAvailableDates(noDate, "2026-12-25", 5)).toEqual(["2026-12-25", "2026-12-26"]);
  });

  it("dia sem horário por bloqueio total não aparece", () => {
    const block = {
      professionalId: null,
      startsAt: at("2026-10-28", "00:00"),
      endsAt: at("2026-10-29", "00:00"),
    };
    expect(getAvailableDates({ ...noDate, blocks: [block] }, "2026-10-28", 2)).toEqual([
      "2026-10-29",
    ]);
  });
});

describe("pickProfessional", () => {
  const slot = (ids: string[]): Slot => ({
    startsAt: NOW,
    endsAt: NOW,
    blockedUntil: NOW,
    professionalIds: ids,
  });

  it("escolhe o de menor carga", () => {
    expect(pickProfessional(slot(["A", "B"]), { A: 5, B: 2 })).toBe("B");
  });
  it("empate vai para o primeiro; sem carga conta como 0", () => {
    expect(pickProfessional(slot(["A", "B"]), { A: 2, B: 2 })).toBe("A");
    expect(pickProfessional(slot(["A", "B"]), { A: 1 })).toBe("B");
  });
  it("slot sem profissionais lança erro", () => {
    expect(() => pickProfessional(slot([]), {})).toThrow();
  });
});
