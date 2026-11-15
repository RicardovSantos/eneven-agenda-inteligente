import type { ReactNode } from "react";

/** Cartão de uma seção de Configurações (`--surface`, borda, raio 16px). */
export function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-5 rounded-panel border border-line bg-surface p-5 sm:p-6"
    >
      <header className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="text-xl font-semibold">
          {title}
        </h2>
        {description ? (
          <p className="text-sm leading-snug text-ink-muted">{description}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}
