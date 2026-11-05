// Own-profile query, shared app-wide (header avatar + activity badge, Home's divider).
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { useUsername } from '@/lib/auth/auth-context'
import { api } from '@/lib/api-client'
import type { User } from '@/types/user'

export const userQueryKey = (username: string) => ['users', username] as const

export function getUser(username: string): Promise<User> {
  return api<User>(`/users/${encodeURIComponent(username)}`)
}

// The signed-in user's own profile. One cache entry shared by the header (avatar,
// activity badge) and Home (lastSeenAt) — the only profile carrying the seen markers.
export function useMe() {
  const username = useUsername()
  return useQuery({ queryKey: userQueryKey(username), queryFn: () => getUser(username) })
}

/** Writes new seen markers into the cached own profile without a refetch. */
export function patchMe(queryClient: QueryClient, username: string, patch: Partial<User>) {
  queryClient.setQueryData<User>(userQueryKey(username), (me) => (me ? { ...me, ...patch } : me))
}
