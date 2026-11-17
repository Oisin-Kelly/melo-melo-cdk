import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sileo } from 'sileo'
import { api } from '@/lib/api-client'
import { useUsername } from '@/lib/auth/auth-context'
import { userQueryKey } from '@/lib/me'
import type { PaginatedResult, UserSummary } from '@/types/api'
import type { User } from '@/types/user'

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

// ---- following (shared: profiles, and People you may know on Home and Search) ----

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

// ---- People you may know: GET /users/suggestions ----

export type SuggestionReason = 'FOLLOWS_YOU' | 'SHARED_WITH_YOU' | 'YOU_SHARED' | 'MUTUALS'

export type Suggestion = {
  user: UserSummary
  reason: SuggestionReason
  /** Up to two people you follow who follow them */
  mutuals: UserSummary[]
  mutualCount: number
}

// Under your own ['users', me] key, which following anyone already refreshes — so following
// someone from a suggestion drops their card without anything extra
const suggestionsKey = (me: string) => ['users', me, 'suggestions'] as const

export function useSuggestions(enabled = true) {
  const me = useUsername()
  return useQuery({
    queryKey: suggestionsKey(me),
    queryFn: async () => (await api<{ items: Suggestion[] }>('/users/suggestions')).items,
    enabled,
    staleTime: 10 * 60 * 1000,
  })
}

/** POST /users/suggestions/{username}/hide (✕): the card goes at once, and comes back if it fails */
export function useHideSuggestion() {
  const queryClient = useQueryClient()
  const me = useUsername()
  return useMutation({
    mutationFn: (username: string) =>
      api(`/users/suggestions/${encodeURIComponent(username)}/hide`, { method: 'POST' }),
    onMutate: async (username) => {
      await queryClient.cancelQueries({ queryKey: suggestionsKey(me) })
      const previous = queryClient.getQueryData<Suggestion[]>(suggestionsKey(me))
      queryClient.setQueryData<Suggestion[]>(suggestionsKey(me), (items) =>
        items?.filter((s) => s.user.username !== username),
      )
      return { previous }
    },
    onError: (_error, _username, context) => {
      queryClient.setQueryData(suggestionsKey(me), context?.previous)
      sileo.error({ title: "Couldn't hide that", description: 'Please try again.' })
    },
  })
}
