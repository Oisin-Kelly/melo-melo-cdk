import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import type { FeedType } from '../api/feed'

// All / Tracks / Albums. Each type (and sort) is its own cached query, so switching
// back is instant.
export function FeedTypePicker({ type, onChange }: { type: FeedType; onChange: (type: FeedType) => void }) {
  return (
    <SegmentedControl label="Show" value={type} onChange={(value) => onChange(value as FeedType)} size="sm">
      <SegmentedControlItem value="ALL" label="All" />
      <SegmentedControlItem value="TRACK" label="Tracks" />
      <SegmentedControlItem value="ALBUM" label="Albums" />
    </SegmentedControl>
  )
}
