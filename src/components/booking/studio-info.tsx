"use client";

import { Clock, MapPin, Navigation, X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { FacebookIcon, InstagramIcon } from "@/components/media/brand-icons";
import { facebookUrl, instagramUrl, mapApps } from "@/lib/public-links";
import type { WeekRow } from "@/lib/week-rows";
import { cn } from "@/lib/utils";

/**
 * "Informações do estúdio": endereço (com a escolha do aplicativo de mapa),
 * horário de atendimento e redes sociais. Cada bloco só aparece se o
 * estabelecimento preencheu o que ele mostra.
 */
export function StudioInfo({
  address,
  rows,
  instagram,
  facebook,
}: {
  address: string | null;
  rows: WeekRow[];
  instagram: string | null;
  facebook: string | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const hasHours = rows.some((r) => !r.closed);
  const hasSocial = Boolean(instagram || facebook);
  if (!address && !hasHours && !hasSocial) return null;

  return (
    <section aria-labelledby="studio-title" className="flex flex-col gap-3.5 px-5 pt-7">
      <div className="flex flex-col gap-0.5">
        <h2 id="studio-title" className="m-0 font-display text-[22px] font-semibold">
          Informações do estúdio
        </h2>
        <p className="m-0 text-[13px] text-ink-muted">Informações para sua visita</p>
      </div>

      <div className="flex flex-col gap-5 rounded-2xl border border-line bg-canvas p-4">
        {address ? (
          <div className="flex gap-3.5">
            <IconBadge>
              <MapPin className="size-[18px]" aria-hidden="true" />
            </IconBadge>
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="m-0 text-[13px] font-semibold text-ink-muted">Endereço</h3>
              <p className="m-0 text-[15px] leading-snug font-medium break-words">{address}</p>
              <button
                type="button"
                onClick={() => dialog.current?.showModal()}
                className="-ml-1 flex min-h-11 items-center gap-1.5 self-start rounded-lg px-1 text-[13.5px] font-semibold text-(--brand) underline-offset-4 hover:underline"
              >
                <Navigation className="size-4" aria-hidden="true" />
                Ver no mapa
              </button>
            </div>
          </div>
        ) : null}

        {address && hasHours ? <hr className="m-0 border-0 border-t border-line" /> : null}

        {hasHours ? (
          <div className="flex gap-3.5">
            <IconBadge>
              <Clock className="size-[18px]" aria-hidden="true" />
            </IconBadge>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <h3 className="m-0 text-[15px] font-semibold">Horário de atendimento</h3>
              <dl className="m-0 flex flex-col gap-2.5 text-[14px]">
                {rows.map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-ink-muted">{row.label}</dt>
                    <dd
                      className={cn(
                        "m-0 text-right font-medium tabular-nums",
                        row.closed && "text-ink-muted",
                      )}
                    >
                      {row.text}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        ) : null}

        {(address || hasHours) && hasSocial ? (
          <hr className="m-0 border-0 border-t border-line" />
        ) : null}

        {hasSocial ? (
          <div className="flex flex-col gap-3">
            <h3 className="m-0 text-[15px] font-semibold">Acompanhe nas redes</h3>
            <div className="grid grid-cols-2 gap-2.5">
              {instagram ? (
                <SocialLink href={instagramUrl(instagram)} label="Instagram">
                  <InstagramIcon className="size-6" />
                </SocialLink>
              ) : null}
              {facebook ? (
                <SocialLink href={facebookUrl(facebook)} label="Facebook">
                  <FacebookIcon className="size-6" />
                </SocialLink>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {address ? (
        <dialog
          ref={dialog}
          aria-labelledby="map-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) event.currentTarget.close();
          }}
          className="m-auto w-[min(360px,calc(100%-40px))] rounded-2xl border border-line bg-surface p-0 text-foreground backdrop:bg-black/50"
        >
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 id="map-title" className="m-0 font-display text-[18px] font-semibold">
                  Abrir no mapa
                </h2>
                <p className="m-0 text-[13px] leading-snug text-ink-muted">{address}</p>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => dialog.current?.close()}
                className="-mt-2 -mr-2 grid size-11 shrink-0 place-items-center rounded-xl hover:bg-primary-soft"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {mapApps(address).map((app) => (
                <li key={app.id}>
                  <a
                    href={app.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => dialog.current?.close()}
                    className="flex min-h-12 items-center justify-between rounded-xl border border-line bg-canvas px-4 text-[15px] font-semibold text-foreground no-underline hover:bg-primary-soft"
                  >
                    {app.label}
                    <Navigation className="size-4 text-ink-muted" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </dialog>
      ) : null}
    </section>
  );
}

function IconBadge({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-[37px] shrink-0 place-items-center rounded-full bg-primary-soft text-ink-muted"
    >
      {children}
    </span>
  );
}

function SocialLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-h-[50px] items-center gap-3 rounded-xl bg-primary-soft px-4 text-[14px] font-semibold text-foreground no-underline transition-opacity hover:opacity-85"
    >
      {children}
      {label}
    </a>
  );
}
