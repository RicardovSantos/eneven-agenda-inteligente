import Link from "next/link";
import { SafeImage } from "@/components/media/safe-image";
import { initialsOf } from "@/lib/initial";

export type TeamMember = {
  id: string;
  name: string;
  title: string | null;
  color: string | null;
  /** Endereço da foto (`/api/midia/...`) ou `null` sem foto. */
  photoUrl: string | null;
};

/** Foto redonda do profissional; sem foto, as iniciais sobre a cor dele. */
export function ProfessionalAvatar({
  member,
  size,
}: {
  member: Pick<TeamMember, "name" | "color" | "photoUrl">;
  size: number;
}) {
  const initials = (
    <span
      aria-hidden="true"
      className="grid size-full place-items-center font-display font-semibold text-white"
      style={{ backgroundColor: member.color ?? "var(--ink-muted)", fontSize: size * 0.36 }}
    >
      {initialsOf(member.name)}
    </span>
  );
  return (
    <div className="shrink-0 rounded-full ring-2 ring-line" style={{ width: size, height: size }}>
      {member.photoUrl ? (
        <SafeImage
          src={member.photoUrl}
          alt=""
          className="size-full rounded-full"
          fallback={initials}
        />
      ) : (
        <div className="size-full overflow-hidden rounded-full">{initials}</div>
      )}
    </div>
  );
}

/**
 * "Nossa equipe": cada profissional é um cartão que abre o agendamento já
 * direcionado a ele (`/{slug}/profissional/{id}`), só com os serviços dele.
 */
export function TeamSection({ slug, team }: { slug: string; team: TeamMember[] }) {
  if (team.length === 0) return null;
  return (
    <section aria-labelledby="team-title" className="flex flex-col gap-3.5 px-5 pt-7">
      <div className="flex flex-col gap-0.5">
        <h2 id="team-title" className="m-0 font-display text-[22px] font-semibold">
          Nossa equipe
        </h2>
        <p className="m-0 text-[13px] text-ink-muted">Escolha quem vai cuidar de você</p>
      </div>
      <ul
        aria-label="Equipe"
        className="-mx-5 m-0 flex list-none snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {team.map((member) => (
          <li key={member.id} className="flex w-[152px] shrink-0 snap-start">
            <Link
              href={`/${slug}/profissional/${member.id}`}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border border-line bg-canvas px-3 pt-5 pb-5 text-center no-underline transition-colors hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--brand)"
            >
              <ProfessionalAvatar member={member} size={96} />
              <span className="mt-1 line-clamp-2 w-full text-[17px] leading-snug font-semibold text-foreground">
                {member.name}
              </span>
              <span className="line-clamp-2 w-full text-[14px] leading-snug text-ink-muted">
                {member.title ?? "Profissional"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
