/** Endereço da página no Instagram a partir do usuário guardado. */
export const instagramUrl = (handle: string) => `https://instagram.com/${encodeURIComponent(handle)}`;

/** Endereço da página no Facebook a partir do nome guardado. */
export const facebookUrl = (handle: string) => `https://facebook.com/${encodeURIComponent(handle)}`;

export type MapApp = { id: "waze" | "google" | "apple"; label: string; href: string };

/**
 * Links que abrem o endereço no aplicativo de navegação escolhido. Todos
 * aceitam o endereço em texto; no celular o sistema oferece abrir o app
 * instalado (Waze, Google Maps, Mapas da Apple).
 */
export function mapApps(address: string): MapApp[] {
  const q = encodeURIComponent(address.trim());
  return [
    { id: "waze", label: "Waze", href: `https://waze.com/ul?q=${q}&navigate=yes` },
    {
      id: "google",
      label: "Google Maps",
      href: `https://www.google.com/maps/search/?api=1&query=${q}`,
    },
    { id: "apple", label: "Mapas da Apple", href: `https://maps.apple.com/?q=${q}` },
  ];
}
