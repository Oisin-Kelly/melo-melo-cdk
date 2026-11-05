// Text length limits, mirroring the API's validators (api/Adapters/Validation/*). Every
// field that takes free text shows a counter against these and blocks saving past them.
export const LIMITS = {
  /** Track, album and playlist names. */
  name: 100,
  genre: 35,
  trackDescription: 4000,
  /** Album and playlist descriptions. */
  description: 1000,
  /** The note sent with a share. */
  caption: 300,
  displayName: 30,
  /** First/last name, city, country. */
  profileField: 35,
  bio: 2000,
  /** A track/album/playlist's readable URL (Domain/Slugs.cs MaxLength). */
  slug: 60,
} as const
