const TOKEN_REGEX = /(@[a-zA-Z0-9_]+|#[a-zA-Z0-9_\u00C0-\u017F]+)/g;

/**
 * Renderiza uma legenda de post com @menções e #hashtags clicáveis.
 *
 * @param {string} caption
 * @param {((username: string) => void) | undefined} onMentionClick
 * @param {((tag: string) => void) | undefined} onHashtagClick
 * @returns {import('react').ReactNode[]}
 */
export function renderCaption(caption, onMentionClick, onHashtagClick) {
  if (!caption) return [];

  const parts = [];
  let lastIndex = 0;

  for (const match of caption.matchAll(TOKEN_REGEX)) {
    const before = caption.slice(lastIndex, match.index);
    if (before) parts.push(before);

    const token = match[0];

    if (token.startsWith('@')) {
      const username = token.slice(1);
      parts.push(
        <button
          key={`mention-${match.index}`}
          type="button"
          onClick={() => onMentionClick?.(username)}
          className="text-green-400 font-semibold hover:underline"
        >
          {token}
        </button>
      );
    } else {
      const tag = token.slice(1);
      parts.push(
        <button
          key={`hashtag-${match.index}`}
          type="button"
          onClick={() => onHashtagClick?.(tag)}
          className="text-blue-400 font-semibold hover:underline"
        >
          {token}
        </button>
      );
    }

    lastIndex = match.index + token.length;
  }

  const tail = caption.slice(lastIndex);
  if (tail) parts.push(tail);

  return parts;
}
