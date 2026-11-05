import type { UserSummary } from '@/types/api'
import { nameOf } from '@/types/user'

/** Whether someone matches a people-screen search (name or @username; a leading @ is ignored). */
export function matchesPerson(user: UserSummary, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^@/, '')
  return !q || user.username.includes(q) || nameOf(user).toLowerCase().includes(q)
}
