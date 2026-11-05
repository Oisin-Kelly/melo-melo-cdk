import { Heading } from '@astryxdesign/core/Heading'
import { VStack } from '@astryxdesign/core/VStack'
import { useEffect, useRef, useState } from 'react'
import { BackButton } from '@/components/navigation/back-button'
import { useActivityUnread } from '../api/activity'
import { ActivityList } from './activity-list'

// /activity: the full-screen activity list — what the bell opens on phones (wider screens
// use the header popover, but the route works there too). Opening it marks everything
// seen; rows that were new keep their dot while you're here.
export function ActivityPage() {
  const { activity, seenAt, isReady, markSeen } = useActivityUnread()
  // Once the profile and first page are in (so the unread count is real): remember the
  // marker as it was, for the dots, and mark everything seen (once)
  const [seenAtOpen, setSeenAtOpen] = useState<number | null>(null)
  if (isReady && seenAtOpen === null) setSeenAtOpen(seenAt)
  const hasMarked = useRef(false)
  useEffect(() => {
    if (!isReady || hasMarked.current) return
    hasMarked.current = true
    markSeen()
  }, [isReady, markSeen])

  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <BackButton fallback="/" className="mm-page-back" />
        <Heading level={1}>Activity</Heading>
      </VStack>
      <ActivityList activity={activity} seenAt={seenAtOpen ?? seenAt} />
    </VStack>
  )
}
