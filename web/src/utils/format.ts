// Display formatting shared by every row that shows durations or times.

/** 154 → "2:34", 3725 → "1:02:05". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = String(s % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

/** 1560 → "26 min", 5400 → "1 hr 30 min". */
export function formatLength(totalSeconds: number): string {
  const minutes = Math.max(1, Math.round(totalSeconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`
}

/** Epoch ms → "28 October 2026" (in the viewer's locale order). */
export function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Epoch ms → "28 Oct 2026": a date short enough for a table column. */
export function formatShortDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** The API's epoch-milliseconds → Astryx Timestamp's unix seconds. */
export const toUnixSeconds = (epochMs: number) => Math.floor(epochMs / 1000)
