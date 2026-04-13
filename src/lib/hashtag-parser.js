const HASHTAG_REGEX = /#([a-zA-Z0-9_\u00C0-\u017F]+)/g;

/**
 * Extrai hashtags de um texto (sem o #), com suporte a acentos.
 * @param {string | null | undefined} text
 * @returns {string[]} Lista de tags únicas (lowercase)
 */
export function extractHashtags(text) {
  if (!text) return [];
  const matches = [...text.matchAll(HASHTAG_REGEX)];
  const unique = [...new Set(matches.map((m) => m[1].toLowerCase()))];
  return unique;
}
