// The manage screens' paths, and the date filter they share.

export const MANAGE_TABS = { tracks: '/tracks', albums: '/albums', playlists: '/playlists' } as const
export type ManageTab = keyof typeof MANAGE_TABS

const DAY_MS = 86_400_000
const WITHIN_DAYS: Record<string, number> = { week: 7, month: 30, year: 365 }

/** The date filter's options: `verb` is "Uploaded" or "Created". */
export const dateOptions = (verb: string) => [
  { value: 'any', label: `${verb} any time` },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
  { value: 'year', label: 'Last 12 months' },
]

/** Whether `createdAt` passes a date filter's value (?uploaded= / ?created=). */
export function isWithin(value: string | null, createdAt: number, now: number) {
  const days = value ? WITHIN_DAYS[value] : undefined
  return days === undefined || createdAt >= now - days * DAY_MS
}
