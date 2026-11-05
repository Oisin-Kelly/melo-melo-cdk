// Client-side text search, shared by global search and the playlist page's search box

/** Lowercase, trimmed, accents removed — "Beyoncé" matches "beyonce". */
export function normalise(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Every word of the query appears somewhere in the (already normalised) haystack. A blank query matches nothing. */
export function matchesWords(haystack: string, query: string): boolean {
  const words = normalise(query).split(/\s+/).filter(Boolean)
  return words.length > 0 && words.every((word) => haystack.includes(word))
}
