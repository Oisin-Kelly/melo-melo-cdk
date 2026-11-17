import { Timestamp } from '@astryxdesign/core/Timestamp'
import { toUnixSeconds } from '@/utils/format'

/** "3 days ago" from epoch milliseconds — every relative time in the app. No hover card:
 *  Astryx's default one spells out "November 10, 2026 at 10:49:26 PM GMT+0", which is
 *  more than anyone needs here. */
export function TimeAgo({ ms }: { ms: number }) {
  return <Timestamp value={toUnixSeconds(ms)} format="relative" hasTooltip={false} />
}
