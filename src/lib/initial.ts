/**
 * Primeira letra do nome, em maiúscula, para o avatar de quem não tem foto.
 * Pula símbolos e emojis do começo; sem nenhuma letra devolve "?".
 */
export function initialOf(name: string): string {
  const letter = name.match(/\p{L}/u)?.[0];
  return letter ? letter.toLocaleUpperCase("pt-BR") : "?";
}

/**
 * Iniciais do nome para o logo de quem não enviou imagem: a primeira letra de
 * cada uma das duas primeiras palavras ("Studio Defendi" -> "SD"). Palavras
 * sem letra (símbolos, emojis) são ignoradas; sem nenhuma letra devolve "?".
 */
export function initialsOf(name: string): string {
  const letters: string[] = [];
  for (const word of name.split(/\s+/)) {
    const letter = word.match(/\p{L}/u)?.[0];
    if (letter) letters.push(letter.toLocaleUpperCase("pt-BR"));
    if (letters.length === 2) break;
  }
  return letters.length > 0 ? letters.join("") : "?";
}
