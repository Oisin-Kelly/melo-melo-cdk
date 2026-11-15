// Shared API envelope types mirroring the backend (see the root CLAUDE.md).
// All backend JSON is camelCase. Domain types (Track, Album, …) live in their
// owning feature's `types`, not here — only cross-cutting shapes belong here.

/** Error body returned by every Lambda handler on failure. */
export type ErrorResponse = {
  statusCode: number
  message: string
  error: string
}

/** Cursor-paginated list response. `nextCursor` is null on the last page. */
export type PaginatedResult<T> = {
  items: T[]
  nextCursor: string | null
}

// ---- Row-level summaries (api/Domain/Summaries.cs) -------------------------------
// Every list/row context serializes these; the full objects only appear on detail GETs.
// Shared here because almost every feature renders a user, track or album row.

export type UserSummary = {
  username: string
  displayName: string | null
  imageUrl: string | null
  imageBgColor: string | null
}

export type TrackSummary = {
  id: string
  name: string
  /** Seconds. */
  duration: number
  imageUrl: string | null
  imageBgColor: string | null
  /** Epoch ms. */
  createdAt: number
  likedByMe: boolean
  owner: UserSummary
  /** Readable-URL slug; null on items made before slugs existed (links fall back to the id). */
  slug?: string | null
}

export type AlbumSummary = {
  id: string
  name: string
  imageUrl: string | null
  imageBgColor: string | null
  trackCount: number
  totalDurationSeconds: number
  /** Epoch ms. */
  createdAt: number
  likedByMe: boolean
  owner: UserSummary
  /** Readable-URL slug; null on items made before slugs existed (links fall back to the id). */
  slug?: string | null
}

// ---- Sharing (albums and tracks share one shape) ----

/** Someone a thing is shared with: GET /albums|tracks/{id}/recipients items. */
export type Recipient = { user: UserSummary; sharedAt: number }

/** Your own share of a track or album (its owner's, so the owner is who shared it):
 *  on the detail GETs for recipients only (api/Domain/ShareNote.cs). */
export type ShareNote = {
  /** Epoch ms. */
  sharedAt: number
  /** Absent when there isn't one. */
  caption?: string
}

/** POST /albums|tracks/{id}/share. `add` must hold only the people being (re)shared with
 *  now: everyone in it is rewritten with this caption, so resending the whole list would
 *  overwrite every existing recipient's caption. */
export type ShareChange = { add: string[]; remove: string[]; caption?: string }
