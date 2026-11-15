import type { QueryClient } from '@tanstack/react-query'

// GET /tracks/{id}/appears-in (a track page's "In albums" / "In your playlists"), cached
// under the track's detail key. Shared here because playlist and album edits elsewhere
// change what it shows: they mark every track's copy stale (only a mounted track page
// refetches, so this is cheap).

export const trackAppearsInKey = (trackId: string) => ['tracks', 'detail', trackId, 'appears-in'] as const

export function invalidateAppearsIn(queryClient: QueryClient) {
  void queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === 'tracks' && query.queryKey[3] === 'appears-in',
  })
}
