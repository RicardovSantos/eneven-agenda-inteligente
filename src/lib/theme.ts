/** Preferência de tema guardada neste aparelho. "auto" segue o sistema. */
export type ThemePreference = "auto" | "light" | "dark";

/** Escolha do dono do estabelecimento (painel e telas de entrada). */
export const THEME_STORAGE_KEY = "eneven-tema";

/**
 * Escolha de quem agenda (página do salão e link de gestão do agendamento). Fica
 * separada da do painel: o dono que deixou o painel escuro não faz o link do cliente
 * abrir escuro num aparelho claro. Sem escolha aqui, vale o tema do aparelho.
 */
export const PUBLIC_THEME_STORAGE_KEY = "eneven-tema-publico";

/** Primeiro trecho do caminho das telas do dono; qualquer outro é tela pública (o slug do salão é livre). */
const OWNER_AREAS = [
  "painel",
  "admin",
  "entrar",
  "cadastro",
  "recuperar-senha",
  "confirmar-email",
  "convite",
  "demo",
  "termos",
  "privacidade",
  "api",
];

/** Em qual chave a preferência de tema deste caminho fica guardada. */
export function themeStorageKey(pathname: string | null | undefined): string {
  const first = (pathname ?? "").split("/")[1] ?? "";
  return first && !OWNER_AREAS.includes(first) ? PUBLIC_THEME_STORAGE_KEY : THEME_STORAGE_KEY;
}

function currentStorageKey(): string {
  return themeStorageKey(typeof location === "undefined" ? null : location.pathname);
}

export function parseThemePreference(value: string | null | undefined): ThemePreference {
  return value === "light" || value === "dark" ? value : "auto";
}

/**
 * Script que roda antes da primeira pintura (no `<head>`) e põe a classe
 * `light` ou `dark` no `<html>`, que o `globals.css` já entende. Sem escolha
 * salva, não faz nada e vale o tema do sistema.
 */
export const THEME_INIT_SCRIPT = `try{var p=(typeof location==="object"&&location.pathname||"").split("/")[1]||"";var k=p&&${JSON.stringify(OWNER_AREAS)}.indexOf(p)<0?${JSON.stringify(PUBLIC_THEME_STORAGE_KEY)}:${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);if(t==="light"||t==="dark")document.documentElement.classList.add(t)}catch(e){}`;

/** Aplica a preferência no `<html>` e a guarda. Falhas de armazenamento não quebram a troca. */
export function applyThemePreference(preference: ThemePreference, root: HTMLElement = document.documentElement): void {
  root.classList.remove("light", "dark");
  if (preference !== "auto") root.classList.add(preference);
  try {
    const key = currentStorageKey();
    if (preference === "auto") localStorage.removeItem(key);
    else localStorage.setItem(key, preference);
  } catch {
    // Navegador com armazenamento bloqueado: a troca vale só até recarregar.
  }
}

export function readThemePreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(currentStorageKey()));
  } catch {
    return "auto";
  }
}
