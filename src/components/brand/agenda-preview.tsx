import { cn } from "@/lib/utils";

type Pro = "Bia" | "Léo";
type Status = "Confirmado" | "Agendado";

type Item = {
  time: string;
  client: string;
  service: string;
  pro: Pro;
  status?: Status;
};

const PRO_COLOR: Record<Pro, string> = {
  Bia: "#b4237a",
  "Léo": "#0e7c86",
};

const BEFORE_NOW: Item[] = [
  {
    time: "09:00",
    client: "Ana Souza",
    service: "Piercing hélix",
    pro: "Bia",
    status: "Confirmado",
  },
  { time: "10:30", client: "Carla Lima", service: "Corte e escova", pro: "Léo" },
];

const AFTER_NOW: Item[] = [
  {
    time: "14:00",
    client: "Juliana Reis",
    service: "Design de sobrancelha",
    pro: "Bia",
  },
  {
    time: "15:30",
    client: "Marina Costa",
    service: "Anodização",
    pro: "Léo",
    status: "Agendado",
  },
];

function Row({ item }: { item: Item }) {
  return (
    <li
      className={cn(
        "relative grid grid-cols-[3.25rem_1fr] items-start gap-x-3 rounded-field border-[1.5px] border-transparent px-3 py-2.5",
        item.status === "Confirmado" &&
          "before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-success",
        item.status === "Agendado" && "border-primary bg-surface",
      )}
    >
      <span className="font-display text-base leading-6 font-semibold tabular-nums">
        {item.time}
      </span>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-semibold leading-6">{item.client}</p>
          {item.status ? (
            <span
              className={cn(
                "shrink-0 text-[0.8125rem] leading-6 font-semibold",
                item.status === "Confirmado"
                  ? "text-[#0b7a44] dark:text-success"
                  : "text-primary",
              )}
            >
              {item.status}
            </span>
          ) : null}
        </div>
        <p className="flex items-center gap-1.5 text-sm leading-5 text-ink-muted">
          <span className="truncate">{item.service}</span>
          <span aria-hidden="true">·</span>
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: PRO_COLOR[item.pro] }}
          />
          <span className="shrink-0">{item.pro}</span>
        </p>
      </div>
    </li>
  );
}

/**
 * Prévia estática e decorativa de um dia de agenda, no mesmo estilo da agenda
 * real. Usada no painel colorido das telas de entrada.
 */
export function AgendaPreview({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "w-full max-w-[400px] rounded-panel border border-line bg-surface p-4 text-left text-ink shadow-float lg:-rotate-2",
        className,
      )}
    >
      <div className="px-3 pb-3 pt-1">
        <p className="font-display text-lg leading-tight font-semibold">
          Terça, 27 de outubro
        </p>
        <p className="text-sm text-ink-muted">8 agendamentos</p>
      </div>
      <ul className="flex flex-col gap-1">
        {BEFORE_NOW.map((item) => (
          <Row key={item.time} item={item} />
        ))}
        <li className="px-3 py-2">
          <div className="fio" />
        </li>
        {AFTER_NOW.map((item) => (
          <Row key={item.time} item={item} />
        ))}
      </ul>
    </div>
  );
}
