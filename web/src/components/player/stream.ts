import type { QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

// GET /tracks/{id}/stream: a presigned URL for the track's audio file, good for 6 hours.
// Kept for (nearly) that long and reused, because the signature is part of the URL: a
// new URL per play would miss the browser's cache every time, while the same URL lets a
// replay (or a step back) use the bytes already fetched. The server signs a matching
// Cache-Control into it.
export type TrackStream = {
  url: string
  /** Epoch ms. */
  expiresAt: number
  /** Seconds. */
  duration: number
}

// Not under ['tracks', …]: invalidating tracks (after an edit, say) mustn't throw away a
// URL that still works
export const streamKey = (trackId: string) => ['stream', trackId] as const

/** Swap for a new URL this long before the old one expires, so it never runs out mid-play. */
const EXPIRY_MARGIN_MS = 10 * 60_000

export async function fetchStreamUrl(queryClient: QueryClient, trackId: string, fresh = false): Promise<string> {
  const stream = await queryClient.fetchQuery({
    queryKey: streamKey(trackId),
    queryFn: () => api<TrackStream>(`/tracks/${trackId}/stream`),
    staleTime: fresh
      ? 0
      : (query) => (query.state.data ? Math.max(0, query.state.data.expiresAt - Date.now() - EXPIRY_MARGIN_MS) : 0),
    gcTime: 6 * 60 * 60_000,
    retry: false,
  })
  return stream.url
}
