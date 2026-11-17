import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { PaginatedResult, TrackSummary } from '@/types/api'

// Shared because two features need the whole set: the album editor's track picker and the
// Your tracks table (which searches, sorts and pages over it client-side).

/** Every track you've uploaded, newest first (GET /tracks, 100 at a time): what an album
 *  can be made of. Under ['tracks', 'mine', …], so uploads and edits refresh it. */
export function useAllMyTracks() {
  return useQuery({
    queryKey: ['tracks', 'mine', 'every'],
    queryFn: async () => {
      const tracks: TrackSummary[] = []
      let cursor: string | null = null
      do {
        const qs: string = `?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
        const page = await api<PaginatedResult<TrackSummary>>(`/tracks${qs}`)
        tracks.push(...page.items)
        cursor = page.nextCursor
      } while (cursor)
      return tracks
    },
  })
}
