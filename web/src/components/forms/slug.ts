import { LIMITS } from '@/config/limits'

// The last part of a track/album/playlist's readable URL. Renaming never changes it; editing it
// here does, and the old URL keeps working as a redirect. Mirrors Domain/Slugs.cs Validate —
// the server also refuses reserved words and URLs already used by another of your items.

const FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Typing is forgiving: capitals lowercase, spaces and underscores become dashes. */
export const normaliseSlug = (value: string) => value.toLowerCase().replace(/[\s_]+/g, '-')

export function slugError(value: string): string | null {
  if (!value) return 'Give it a URL.'
  if (value.length > LIMITS.slug) return `Keep it to ${LIMITS.slug} characters.`
  if (!FORMAT.test(value)) return 'Use lowercase letters, numbers and single dashes.'
  return null
}
