import { useQueries, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { useUsername } from '@/lib/auth/auth-context'
import { albumPath, playlistPath, trackPath } from '@/lib/links'
import { cleanUsernameQuery, MIN_PEOPLE_QUERY, searchPeople } from '@/lib/people'
import type { AlbumSummary, PaginatedResult, TrackSummary } from '@/types/api'
import { nameOf } from '@/types/user'
import { matchesWords, normalise } from '@/utils/search-text'

// Global search (see docs/frontend-notes/search.md): people are searched server-side
// (GET /users/search, username prefix); everything else is matched client-side against
// the user's whole library, fetched once with limit=100 and cached for a few minutes.

// ---- people (server-side) ----

export function usePeopleSearch(query: string) {
  const q = cleanUsernameQuery(query)
  return useQuery({
    queryKey: ['search', 'people', q],
    // TanStack aborts the superseded request via `signal`, so stale results can't land
    queryFn: ({ signal }) => searchPeople(q, { limit: 5, signal }),
    enabled: q.length >= MIN_PEOPLE_QUERY,
    staleTime: 30_000,
  })
}

// ---- library (client-side) ----

export type LibraryHit = {
  kind: 'TRACK' | 'ALBUM' | 'PLAYLIST'
  id: string
  name: string
  /** Owner's display name, for tracks and albums. */
  by?: string
  imageUrl: string | null
  imageBgColor: string | null
  href: string
  /** Normalised text the query is matched against (name + owner). */
  haystack: string
}

type PlaylistRow = {
  id: string
  name: string
  slug?: string | null
  imageUrl: string | null
  imageBgColor: string | null
}
type SharedAlbumRow = { album: AlbumSummary }

async function fetchAll<T>(path: string, signal: AbortSignal): Promise<T[]> {
  const items: T[] = []
  let cursor: string | null = null
  do {
    const sep = path.includes('?') ? '&' : '?'
    const page: PaginatedResult<T> = await api<PaginatedResult<T>>(
      `${path}${sep}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      { signal },
    )
    items.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)
  return items
}

const trackHit = (t: TrackSummary): LibraryHit => ({
  kind: 'TRACK',
  id: t.id,
  name: t.name,
  by: nameOf(t.owner),
  imageUrl: t.imageUrl,
  imageBgColor: t.imageBgColor,
  href: trackPath(t),
  haystack: normalise(`${t.name} ${nameOf(t.owner)} ${t.owner.username}`),
})

const albumHit = (a: AlbumSummary): LibraryHit => ({
  kind: 'ALBUM',
  id: a.id,
  name: a.name,
  by: nameOf(a.owner),
  imageUrl: a.imageUrl,
  imageBgColor: a.imageBgColor,
  href: albumPath(a),
  haystack: normalise(`${a.name} ${nameOf(a.owner)} ${a.owner.username}`),
})

// Playlists are always the viewer's own, so their URL needs the viewer's username
const playlistHit = (p: PlaylistRow, me: string): LibraryHit => ({
  kind: 'PLAYLIST',
  id: p.id,
  name: p.name,
  imageUrl: p.imageUrl,
  imageBgColor: p.imageBgColor,
  href: playlistPath(p, me),
  haystack: normalise(p.name),
})

// Keys start with the resource they cache (['playlists', …], ['albums', 'liked', …]),
// so any mutation that invalidates that resource — creating a playlist, liking an
// album — also refreshes search's copy. 'all' marks the fully-paged search snapshot.
const sources = (me: string): { key: readonly string[]; load: (signal: AbortSignal) => Promise<LibraryHit[]> }[] => [
  // Every track you can play — yours, shared directly, and in albums shared with you —
  // in one unpaged list (GET /tracks/library)
  {
    key: ['tracks', 'library', 'all'],
    load: async (s) => (await fetchAll<TrackSummary>('/tracks/library', s)).map(trackHit),
  },
  { key: ['albums', 'mine', 'all'], load: async (s) => (await fetchAll<AlbumSummary>('/albums', s)).map(albumHit) },
  {
    key: ['albums', 'shared', 'all'],
    load: async (s) => (await fetchAll<SharedAlbumRow>('/albums/shared', s)).map((r) => albumHit(r.album)),
  },
  { key: ['albums', 'liked', 'all'], load: async (s) => (await fetchAll<AlbumSummary>('/albums/liked', s)).map(albumHit) },
  { key: ['playlists', 'all'], load: async (s) => (await fetchAll<PlaylistRow>('/playlists', s)).map((p) => playlistHit(p, me)) },
]

/**
 * Everything the user can search locally, fetched only once search is opened (`enabled`).
 * `isComplete` is false while any source is still loading — callers must not show
 * "no results" until it's true, or an item on an unfetched page would look missing.
 */
export function useLibraryIndex(enabled: boolean) {
  const me = useUsername()
  const results = useQueries({
    queries: sources(me).map((source) => ({
      queryKey: source.key,
      queryFn: ({ signal }: { signal: AbortSignal }) => source.load(signal),
      enabled,
      // Refetched every time search opens (showing the cached copy meanwhile): shares arrive
      // with no push, so a snapshot can be out of date the moment it's taken
      staleTime: 0,
    })),
  })

  const seen = new Set<string>()
  const hits: LibraryHit[] = []
  for (const result of results) {
    for (const hit of result.data ?? []) {
      const key = `${hit.kind}:${hit.id}` // a track can be both yours-shared and liked, etc.
      if (seen.has(key)) continue
      seen.add(key)
      hits.push(hit)
    }
  }

  return {
    hits,
    isComplete: results.every((r) => r.isSuccess || r.isError),
    hasError: results.some((r) => r.isError),
    retry: () => results.filter((r) => r.isError).forEach((r) => void r.refetch()),
  }
}

/** Every word of the query must appear somewhere in the hit's name/owner. */
export function matchesQuery(hit: LibraryHit, query: string): boolean {
  return matchesWords(hit.haystack, query)
}
