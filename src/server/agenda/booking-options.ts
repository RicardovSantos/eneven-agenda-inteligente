/**
 * O que o "Novo agendamento" do painel oferece: `staff` só enxerga o próprio
 * profissional e os serviços que ele faz; os demais, todos os profissionais e
 * os serviços que alguém faz. Única regra, usada pela agenda e pela ficha do cliente.
 */
export function panelBookingOptions(
  allPros: Array<{ id: string; name: string; color: string | null }>,
  catalog: Array<{
    id: string;
    name: string;
    durationMin: number;
    priceCents: number;
    professionalIds: string[];
  }>,
  own: { id: string; name: string; color: string | null } | null,
) {
  const professionals = (own ? [own] : allPros).map((p) => ({ id: p.id, name: p.name, color: p.color }));
  const services = catalog
    .filter((s) => (own ? s.professionalIds.includes(own.id) : s.professionalIds.length > 0))
    .map((s) => ({
      id: s.id,
      name: s.name,
      durationMin: s.durationMin,
      priceCents: s.priceCents,
      professionalIds: s.professionalIds,
    }));
  return { professionals, services };
}
