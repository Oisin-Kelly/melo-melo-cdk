// Full profile from GET /users/{username} (api/Domain/User.cs).
export type IncomingShares = 'EVERYONE' | 'FOLLOWING' | 'NONE'

export type User = {
  username: string
  displayName: string | null
  firstName: string | null
  lastName: string | null
  country: string | null
  city: string | null
  bio: string | null
  imageUrl: string | null
  imageBgColor: string | null
  followingCount: number
  followerCount: number
  incomingShares: IncomingShares | null
  /** Epoch ms. */
  createdAt: number
  /** Someone else's profile only: how many of their tracks you can hear. */
  sharedWithYouCount?: number
  /** Your own profile only (epoch ms): drives the "new since your last visit" divider. */
  lastSeenAt?: number
  /** Your own profile only (epoch ms): activity newer than this is unread. */
  activitySeenAt?: number
}

/** The name to show: display name if set, otherwise the username. */
export function nameOf(user: { username: string; displayName: string | null }): string {
  return user.displayName?.trim() || user.username
}
