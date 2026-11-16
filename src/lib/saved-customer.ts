/**
 * Nome e WhatsApp do cliente lembrados NO APARELHO dele (localStorage) para o próximo
 * agendamento já vir preenchido. Nada disso vai para o servidor: só o navegador lê.
 * Nunca guarda e-mail nem o consentimento (a caixinha de concordância é marcada a cada agendamento).
 */
import { normalizeBrazilPhone } from "@/lib/phone";

const KEY = "eneven:cliente";

export type SavedCustomer = { name: string; phone: string };

/** Lê o que foi guardado; devolve `null` se não há nada, se está inválido ou se o navegador bloqueia o acesso. */
export function readSavedCustomer(): SavedCustomer | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SavedCustomer> | null;
    const name = typeof data?.name === "string" ? data.name.trim().slice(0, 80) : "";
    const phone = typeof data?.phone === "string" ? data.phone : "";
    if (name.length < 2 || !normalizeBrazilPhone(phone)) return null;
    return { name, phone };
  } catch {
    return null;
  }
}

export function saveCustomer(customer: SavedCustomer): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ name: customer.name.trim(), phone: customer.phone }));
  } catch {
    // Modo privado ou armazenamento cheio: simplesmente não lembra.
  }
}

export function clearSavedCustomer(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // sem acesso ao armazenamento: nada a limpar
  }
}
