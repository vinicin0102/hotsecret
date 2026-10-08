// Validação de nome real do comprador — usada no servidor (checkout) e no navegador (formulário).
/**
 * Nome e sobrenome reais (a Zenith recusa nomes ausentes, repetidos, com números, só iniciais ou fictícios):
 * pelo menos duas palavras com letras, nenhuma de uma letra só, sem dígitos e sem repetição tipo "aaaa".
 */
export function validPersonName(v: string): boolean {
  const name = v.trim().replace(/\s+/g, " ");
  if (/\d/.test(name) || !/^[\p{L}' .-]+$/u.test(name)) return false;
  const words = name.split(" ").filter((w) => /\p{L}/u.test(w));
  const letters = (w: string) => w.replace(/[^\p{L}]/gu, "");
  // pelo menos nome + sobrenome; inicial isolada não vale (o conectivo "y"/"e" sim: "Ortega y Gasset")
  if (words.filter((w) => letters(w).length >= 2).length < 2) return false;
  if (words.some((w) => letters(w).length < 2 && !/^[ye]$/i.test(letters(w)))) return false;
  if (/(\p{L})\1{2,}/iu.test(name)) return false;
  // "Ana Ana" é fictício; sobrenome repetido depois do nome ("Juan Pérez Pérez") é comum no México
  if (words.length === 2 && words[0].toLowerCase() === words[1].toLowerCase()) return false;
  return !/\b(teste?|test|fulano|cliente|nombre|apellido|asdf|qwerty|prueba)\b/i.test(name);
}

