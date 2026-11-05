import type { AlbumSummary, TrackSummary, UserSummary } from '@/types/api'
import type { User } from '@/types/user'

// Minimal valid API shapes; override what a test cares about.

export const userSummary = (username: string, extra: Partial<UserSummary> = {}): UserSummary => ({
  username,
  displayName: null,
  imageUrl: null,
  imageBgColor: null,
  ...extra,
})

export const trackSummary = (id: string, extra: Partial<TrackSummary> = {}): TrackSummary => ({
  id,
  name: `Track ${id}`,
  duration: 180,
  imageUrl: null,
  imageBgColor: null,
  createdAt: 1_700_000_000_000,
  likedByMe: false,
  owner: userSummary('owner'),
  slug: `track-${id}`,
  ...extra,
})

export const albumSummary = (id: string, extra: Partial<AlbumSummary> = {}): AlbumSummary => ({
  id,
  name: `Album ${id}`,
  imageUrl: null,
  imageBgColor: null,
  trackCount: 3,
  totalDurationSeconds: 600,
  createdAt: 1_700_000_000_000,
  likedByMe: false,
  owner: userSummary('owner'),
  slug: `album-${id}`,
  ...extra,
})

export const user = (username: string, extra: Partial<User> = {}): User => ({
  username,
  displayName: null,
  firstName: null,
  lastName: null,
  country: null,
  city: null,
  bio: null,
  imageUrl: null,
  imageBgColor: null,
  followingCount: 0,
  followerCount: 0,
  followingsPrivate: false,
  followersPrivate: false,
  incomingShares: 'EVERYONE',
  createdAt: 1_700_000_000_000,
  ...extra,
})

/** One infinite-query page as the cache stores it. */
export const pages = <T,>(...pageItems: T[][]) => ({
  pages: pageItems.map((items, i) => ({ items, nextCursor: i < pageItems.length - 1 ? `c${i + 1}` : null })),
  pageParams: pageItems.map((_, i) => (i === 0 ? null : `c${i}`)),
})
