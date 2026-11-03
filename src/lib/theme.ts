/** Preferência de tema guardada neste aparelho. "auto" segue o sistema. */
export type ThemePreference = "auto" | "light" | "dark";

export const THEME_STORAGE_KEY = "eneven-tema";

export function parseThemePreference(value: string | null | undefined): ThemePreference {
  return value === "light" || value === "dark" ? value : "auto";
}

/**
 * Script que roda antes da primeira pintura (no `<head>`) e põe a classe
 * `light` ou `dark` no `<html>`, que o `globals.css` já entende. Sem escolha
 * salva, não faz nada e vale o tema do sistema.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark")document.documentElement.classList.add(t)}catch(e){}`;

/** Aplica a preferência no `<html>` e a guarda. Falhas de armazenamento não quebram a troca. */
export function applyThemePreference(preference: ThemePreference, root: HTMLElement = document.documentElement): void {
  root.classList.remove("light", "dark");
  if (preference !== "auto") root.classList.add(preference);
  try {
    if (preference === "auto") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Navegador com armazenamento bloqueado: a troca vale só até recarregar.
  }
}

export function readThemePreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "auto";
  }
}
