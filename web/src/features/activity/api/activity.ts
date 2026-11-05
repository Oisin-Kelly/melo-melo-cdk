import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { api } from '@/lib/api-client'
import { useUsername } from '@/lib/auth/auth-context'
import { patchMe, useMe } from '@/lib/me'
import type { PaginatedResult, UserSummary } from '@/types/api'

// GET /activity — a live snapshot of what happened to you (api/Domain/Activity.cs).
// Rows whose like/share/follow no longer exists are dropped server-side.
export type ActivityType =
  | 'TRACK_LIKED'
  | 'ALBUM_LIKED'
  | 'TRACK_SHARED'
  | 'ALBUM_SHARED'
  | 'USER_FOLLOWED'

export type ActivityEntry = {
  type: ActivityType
  actor: UserSummary
  targetType: 'TRACK' | 'ALBUM' | 'USER'
  targetId: string
  /** Track/album name; absent for USER targets. */
  targetName?: string
  /** For the target's readable URL; absent on USER targets and pre-slug items. */
  targetOwner?: string
  targetSlug?: string
  /** Epoch ms. */
  createdAt: number
}

export const ACTIVITY_PAGE_SIZE = 20 // fixed server-side

export function useActivity() {
  return useInfiniteQuery({
    queryKey: ['activity'],
    queryFn: ({ pageParam }) =>
      api<PaginatedResult<ActivityEntry>>(
        `/activity${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    // No push from the server, so poll: every minute while the tab is visible (TanStack
    // pauses intervals in the background) and whenever you come back to it
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  })
}

const SHARE_TYPES: ActivityType[] = ['TRACK_SHARED', 'ALBUM_SHARED']

/** Newest "shared with you" time on the first page, or 0. */
function newestShareAt(entries: ActivityEntry[] | undefined): number {
  return Math.max(0, ...(entries ?? []).filter((e) => SHARE_TYPES.includes(e.type)).map((e) => e.createdAt))
}

// When polling turns up a share newer than any seen this visit, refresh what it adds to:
// Home, search's library snapshots (tracks incl. album tracks, shared albums) and profiles'
// shared-with-you lists — so it shows up without reloading the page.
export function useRefreshOnNewShares(firstPage: ActivityEntry[] | undefined) {
  const queryClient = useQueryClient()
  const newest = newestShareAt(firstPage)
  const seen = useRef<number | null>(null)

  useEffect(() => {
    if (firstPage === undefined) return
    if (seen.current !== null && newest > seen.current) {
      void queryClient.invalidateQueries({ queryKey: ['feed'] })
      void queryClient.invalidateQueries({ queryKey: ['tracks', 'library'] })
      void queryClient.invalidateQueries({ queryKey: ['albums', 'shared'] })
      void queryClient.invalidateQueries({ queryKey: ['users'] })
    }
    seen.current = Math.max(seen.current ?? 0, newest)
  }, [firstPage, newest, queryClient])
}

// POST /me/activity-seen, then mirror the new marker into the cached profile so the
// badge clears immediately instead of after a profile refetch.
export function useMarkActivitySeen() {
  const queryClient = useQueryClient()
  const username = useUsername()
  return useMutation({
    mutationFn: () => api<void>('/me/activity-seen', { method: 'POST' }),
    onSuccess: () => patchMe(queryClient, username, { activitySeenAt: Date.now() }),
  })
}

// Unread state for the bell and the activity screen: rows newer than your activitySeenAt
// (counted on the first page only — "20+" if all of it is new), and `markSeen`, which
// clears the badge when the list is opened.
export function useActivityUnread() {
  const me = useMe()
  const activity = useActivity()
  const markSeen = useMarkActivitySeen()
  const seenAt = me.data?.activitySeenAt ?? 0
  const firstPage = activity.data?.pages[0]
  const unread = firstPage?.items.filter((entry) => entry.createdAt > seenAt).length ?? 0
  const badge =
    unread === 0
      ? null
      : unread >= ACTIVITY_PAGE_SIZE && firstPage?.nextCursor
        ? `${ACTIVITY_PAGE_SIZE}+`
        : String(unread)
  return {
    activity,
    seenAt,
    badge,
    /** Both the profile and the first page have loaded, so `unread` is real. */
    isReady: me.data !== undefined && firstPage !== undefined,
    markSeen: () => {
      if (unread > 0) markSeen.mutate()
    },
  }
}
