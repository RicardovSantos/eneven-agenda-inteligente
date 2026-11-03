import { SafeImage } from "@/components/media/safe-image";
import { initialsOf } from "@/lib/initial";

/**
 * Círculo com a foto da pessoa (ou as iniciais) e um anel na cor que ela escolheu,
 * para a cor continuar identificando o profissional mesmo com foto.
 */
export function PersonAvatar({
  name,
  color,
  photoUrl,
  size = 28,
}: {
  name: string;
  color: string | null;
  photoUrl?: string | null;
  size?: number;
}) {
  const ring = color ?? "var(--ink-muted)";
  const initials = (
    <span
      aria-hidden="true"
      className="grid size-full place-items-center font-display font-semibold text-white"
      style={{ backgroundColor: ring, fontSize: Math.max(10, size * 0.4) }}
    >
      {initialsOf(name)}
    </span>
  );
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size, boxShadow: `0 0 0 2px ${ring}` }}
    >
      {photoUrl ? <SafeImage src={photoUrl} alt="" className="size-full rounded-full" fallback={initials} /> : initials}
    </span>
  );
}

/** Foto (ou inicial) com anel na cor do profissional e o nome ao lado. */
export function PersonLabel({
  name,
  color,
  photoUrl,
  size = 22,
  className,
}: {
  name: string;
  color: string | null;
  photoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className ?? ""}`}>
      <PersonAvatar name={name} color={color} photoUrl={photoUrl} size={size} />
      <span className="truncate">{name}</span>
    </span>
  );
}
