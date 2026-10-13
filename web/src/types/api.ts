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
