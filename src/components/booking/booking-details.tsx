import { formatShortDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";
import type { BookingView } from "@/server/public/view";
import type { BookingTenant } from "./shell";

/** Resumo do agendamento (confirmação e gestão): serviço, quando, com quem, onde e valor. */
export function BookingDetails({
  booking,
  tenant,
}: {
  booking: BookingView;
  tenant: Pick<BookingTenant, "address">;
}) {
  const rows: Array<[string, string, boolean]> = [
    ["Serviço", booking.services.map((s) => s.name).join(", "), false],
    ["Quando", `${formatShortDate(booking.date)} às ${booking.time}`, true],
    ["Com", booking.professionalName, false],
  ];
  if (tenant.address) rows.push(["Onde", tenant.address, false]);
  rows.push(["Valor", `${formatBRL(booking.totalCents)} · pago no local`, true]);

  return (
    <dl className="m-0 grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-3 rounded-panel border border-line p-[18px] text-[15px]">
      {rows.map(([label, value, numeric]) => (
        <div key={label} className="contents">
          <dt className="text-ink-muted">{label}</dt>
          <dd className={`m-0 font-semibold ${numeric ? "tabular-nums" : ""}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
