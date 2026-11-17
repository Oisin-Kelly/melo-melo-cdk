import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { getUser, userQueryKey } from '@/lib/me'
import type { AlbumSummary, PaginatedResult, TrackSummary, UserSummary } from '@/types/api'

// A profile (/u/:username): the person and what they've shared
// with you — or, on your own profile, what you've made. Everything about a person sits
// under ['users', username, …], so one invalidation refreshes their whole page.

/** GET /users/{username}. Your own is the same cache entry useMe() reads. */
export function useUser(username: string) {
  return useQuery({ queryKey: userQueryKey(username), queryFn: () => getUser(username) })
}

// ---- lists ----

export type SharedTrack = { track: TrackSummary; sharedAt: number; caption?: string }
export type SharedAlbum = { album: AlbumSummary; sharedAt: number; caption?: string }

function infiniteList<T>(queryKey: readonly unknown[], path: string, limit?: number) {
  return {
    queryKey,
    queryFn: ({ pageParam }: { pageParam: string | null }) => {
      const params = new URLSearchParams()
      if (limit) params.set('limit', String(limit))
      if (pageParam) params.set('cursor', pageParam)
      const qs = params.toString()
      return api<PaginatedResult<T>>(qs ? `${path}?${qs}` : path)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page: PaginatedResult<T>) => page.nextCursor,
  }
}

const u = (username: string) => encodeURIComponent(username)

/** GET /users/{username}/albums/shared — albums they shared with you, newest first. */
export function useAlbumsSharedFrom(username: string, enabled: boolean) {
  return useInfiniteQuery({
    ...infiniteList<SharedAlbum>(['users', username, 'shared-albums'], `/users/${u(username)}/albums/shared`, 20),
    enabled,
  })
}

/** GET /users/{username}/shared — tracks they shared with you directly, newest first. */
export function useTracksSharedFrom(username: string, enabled: boolean) {
  return useInfiniteQuery({
    ...infiniteList<SharedTrack>(['users', username, 'shared-tracks'], `/users/${u(username)}/shared`),
    enabled,
  })
}

// Your own uploads. Under the 'albums' / 'tracks' prefixes so creating, editing or
// deleting them (and liking) refreshes these too; never the search snapshot keys (…, 'all').

/** GET /albums — your albums, newest first. */
export function useMyAlbums(enabled: boolean) {
  return useInfiniteQuery({ ...infiniteList<AlbumSummary>(['albums', 'mine', 'list'], '/albums', 20), enabled })
}

/** GET /tracks — your tracks, newest first. */
export function useMyTracks(enabled: boolean) {
  return useInfiniteQuery({ ...infiniteList<TrackSummary>(['tracks', 'mine', 'list'], '/tracks', 20), enabled })
}

export type FollowListKind = 'followers' | 'following'

/** GET /users/{username}/followers | /followings — newest first. */
export function useFollowList(username: string, kind: FollowListKind) {
  const path = kind === 'followers' ? 'followers' : 'followings'
  return useInfiniteQuery(infiniteList<UserSummary>(['users', username, kind], `/users/${u(username)}/${path}`))
}
