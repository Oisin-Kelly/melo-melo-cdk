import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { AlbumSummary, PaginatedResult, TrackSummary, UserSummary } from '@/types/api'

// ---- GET /feed: tracks + albums shared with you (api/Domain/Feed.cs) ----

export type FeedType = 'ALL' | 'TRACK' | 'ALBUM'
export type FeedSort = 'newest' | 'oldest'
export const FEED_SORT_OPTIONS: Record<FeedSort, string> = { newest: 'Newest', oldest: 'Oldest' }

export type FeedEntry = {
  type: 'TRACK' | 'ALBUM'
  sender: UserSummary
  /** Epoch ms. A re-share moves the entry up with a fresh time. */
  sharedAt: number
  /** Absent (not null) when there isn't one. */
  caption?: string
  track?: TrackSummary
  album?: AlbumSummary
}

const feedKey = (type: FeedType, sort: FeedSort) => ['feed', type, sort] as const

export function useFeed(type: FeedType, sort: FeedSort) {
  return useInfiniteQuery({
    queryKey: feedKey(type, sort),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams()
      if (type !== 'ALL') params.set('type', type)
      if (sort === 'oldest') params.set('sort', 'asc')
      if (pageParam) params.set('cursor', pageParam)
      const qs = params.toString()
      return api<PaginatedResult<FeedEntry>>(`/feed${qs ? `?${qs}` : ''}`)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    // Shares arrive with no push; pick them up when the user comes back to the tab
    refetchOnWindowFocus: true,
  })
}

// ---- GET /me/progress: the single resume slot ----

export type ProgressEntry = {
  contextType: 'TRACK' | 'ALBUM' | 'PLAYLIST'
  contextId: string
  trackId: string
  positionSeconds: number
  /** Epoch ms. */
  updatedAt: number
  track: TrackSummary
}

// 204 (nothing to resume, or the track is gone / no longer shared) → null.
export function useProgress() {
  return useQuery({
    queryKey: ['progress'],
    queryFn: async () => (await api<ProgressEntry | undefined>('/me/progress')) ?? null,
    retry: false, // a convenience card; never worth retrying
  })
}

// ---- POST /me/seen: bump lastSeenAt (after the page has captured the old value) ----

export function useMarkSeen() {
  return useMutation({ mutationFn: () => api<void>('/me/seen', { method: 'POST' }) })
}
