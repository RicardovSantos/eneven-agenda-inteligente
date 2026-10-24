/**
 * Primeira letra do nome, em maiúscula, para o avatar de quem não tem foto.
 * Pula símbolos e emojis do começo; sem nenhuma letra devolve "?".
 */
export function initialOf(name: string): string {
  const letter = name.match(/\p{L}/u)?.[0];
  return letter ? letter.toLocaleUpperCase("pt-BR") : "?";
}
