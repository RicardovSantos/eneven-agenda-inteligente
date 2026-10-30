export const demoServices = [
  { name: "Corte e finalização", duration: "45 min", price: "R$ 65" },
  { name: "Manicure", duration: "40 min", price: "R$ 40" },
  { name: "Escova", duration: "30 min", price: "R$ 45" },
] as const;

export const demoTimes = ["09:00", "10:30", "14:00", "15:30"] as const;

/** Aceita somente opções fictícias conhecidas, sem receber dados pessoais. */
export function getDemoSelection(service: unknown, time: unknown) {
  if (typeof service !== "string" || !/^[0-2]$/.test(service) || typeof time !== "string" || !demoTimes.some((item) => item === time)) return null;
  return { service: demoServices[Number(service)], time };
}
