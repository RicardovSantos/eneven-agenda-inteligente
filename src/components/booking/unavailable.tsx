import { BrandMark, brandButton, whatsappUrl, type BookingTenant } from "./shell";

/** Estabelecimento que não pode receber agendamentos agora (e-mail, plano ou sem serviço). */
export function Unavailable({ tenant }: { tenant: BookingTenant }) {
  return (
    <>
      <header className="flex items-center gap-3.5 border-b border-line px-5 pt-5 pb-4">
        <BrandMark name={tenant.name} logoUrl={tenant.logoUrl} size="lg" />
        <div className="flex min-w-0 flex-col gap-[3px]">
          <h1 className="m-0 font-display text-[21px] leading-tight font-semibold">{tenant.name}</h1>
          {tenant.subtitle ? (
            <span className="text-[13px] text-ink-muted">{tenant.subtitle}</span>
          ) : null}
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-6 px-5 pt-8 pb-8">
        <p className="m-0 text-lg leading-snug font-semibold">
          Agendamento online indisponível no momento.
        </p>
        {tenant.whatsapp ? (
          <a
            href={whatsappUrl(tenant.whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            className={brandButton}
          >
            Falar com {tenant.name} no WhatsApp
          </a>
        ) : null}
      </main>
    </>
  );
}
