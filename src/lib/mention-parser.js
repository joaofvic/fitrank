const MENTION_REGEX = /@([a-zA-Z0-9_]+)/g;

/**
 * Extrai usernames mencionados de um texto (sem o @).
 * @param {string | null | undefined} text
 * @returns {string[]} Lista de usernames únicos (lowercase)
 */
export function extractMentions(text) {
  if (!text) return [];
  const matches = [...text.matchAll(MENTION_REGEX)];
  const unique = [...new Set(matches.map((m) => m[1].toLowerCase()))];
  return unique;
}
