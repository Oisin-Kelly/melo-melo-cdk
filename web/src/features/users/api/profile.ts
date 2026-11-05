import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sileo } from 'sileo'
import { api, ApiError } from '@/lib/api-client'
import { useUsername } from '@/lib/auth/auth-context'
import { getUser, userQueryKey } from '@/lib/me'
import type { AlbumSummary, PaginatedResult, TrackSummary, UserSummary } from '@/types/api'
import type { User } from '@/types/user'

// A profile (/u/:username): the person, whether you follow them, and what they've shared
// with you — or, on your own profile, what you've made. Everything about a person sits
// under ['users', username, …], so one invalidation refreshes their whole page.

/** GET /users/{username}. Your own is the same cache entry useMe() reads. */
export function useUser(username: string) {
  return useQuery({ queryKey: userQueryKey(username), queryFn: () => getUser(username) })
}

// ---- following ----

const followStatusKey = (username: string) => ['users', username, 'follow-status'] as const

/** GET /users/{username}/follow-status — do I follow them? */
export function useFollowStatus(username: string, enabled: boolean) {
  return useQuery({
    queryKey: followStatusKey(username),
    queryFn: () => api<{ followStatus: boolean }>(`/users/${encodeURIComponent(username)}/follow-status`),
    select: (status) => status.followStatus,
    enabled,
  })
}

/** POST /users/{username}/follow-user {newValue}. Optimistic: the button and their
 *  follower count flip at once, and roll back if the request fails. */
export function useToggleFollow(username: string) {
  const queryClient = useQueryClient()
  const me = useUsername()

  return useMutation({
    mutationFn: (follow: boolean) =>
      api(`/users/${encodeURIComponent(username)}/follow-user`, { method: 'POST', body: { newValue: follow } }),
    onMutate: async (follow) => {
      await queryClient.cancelQueries({ queryKey: ['users', username] })
      const previousStatus = queryClient.getQueryData(followStatusKey(username))
      const previousUser = queryClient.getQueryData<User>(userQueryKey(username))
      queryClient.setQueryData(followStatusKey(username), { followStatus: follow })
      queryClient.setQueryData<User>(userQueryKey(username), (user) =>
        user ? { ...user, followerCount: Math.max(0, user.followerCount + (follow ? 1 : -1)) } : user,
      )
      return { previousStatus, previousUser }
    },
    onError: (_error, follow, context) => {
      queryClient.setQueryData(followStatusKey(username), context?.previousStatus)
      queryClient.setQueryData(userQueryKey(username), context?.previousUser)
      sileo.error({ title: follow ? "Couldn't follow" : "Couldn't unfollow", description: 'Please try again.' })
    },
    onSettled: () => {
      // Their page (followers, count) and mine (following count + list)
      void queryClient.invalidateQueries({ queryKey: ['users', username] })
      void queryClient.invalidateQueries({ queryKey: ['users', me] })
    },
  })
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

/** GET /users/{username}/followers | /followings — 403 when they've made it private. */
export function useFollowList(username: string, kind: FollowListKind) {
  const path = kind === 'followers' ? 'followers' : 'followings'
  return useInfiniteQuery({
    ...infiniteList<UserSummary>(['users', username, kind], `/users/${u(username)}/${path}`),
    retry: (count, error) => !isForbidden(error) && count < 1,
  })
}

export const isForbidden = (error: unknown) => error instanceof ApiError && error.status === 403
