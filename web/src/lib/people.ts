import { api } from '@/lib/api-client'
import type { PaginatedResult, UserSummary } from '@/types/api'

// GET /users/search: username-prefix people search, shared by the header search and
// the share dialogs' people pickers.

// The API 400s on anything outside the username charset, so strip rather than error
export function cleanUsernameQuery(query: string): string {
  return query.trim().toLowerCase().replace(/[^a-z0-9._]/g, '')
}

export const MIN_PEOPLE_QUERY = 2 // one letter is the broadest possible prefix — rarely useful

/** Expects an already-cleaned query of at least MIN_PEOPLE_QUERY characters. */
export async function searchPeople(
  q: string,
  { limit, signal }: { limit: number; signal?: AbortSignal },
): Promise<UserSummary[]> {
  const page = await api<PaginatedResult<UserSummary>>(
    `/users/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    { signal },
  )
  return page.items
}
