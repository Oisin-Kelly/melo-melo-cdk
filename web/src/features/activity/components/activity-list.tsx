import { Illustration } from '@/components/illustrations/illustration'
import { InfiniteList } from '@/components/lists/infinite-list'
import type { useActivity } from '../api/activity'
import { ActivityRow } from './activity-row'

// The activity rows, newest first — shared by the desktop popover and the phone screen.
// Rows newer than `seenAt` (your marker when the list was opened) get the "new" dot.
export function ActivityList({ activity, seenAt }: { activity: ReturnType<typeof useActivity>; seenAt: number }) {
  return (
    <InfiniteList
      loadingWhat="activity"
      query={activity}
      getKey={(entry) => `${entry.type}:${entry.actor.username}:${entry.targetId}:${entry.createdAt}`}
      renderItem={(entry) => <ActivityRow entry={entry} isUnread={entry.createdAt > seenAt} />}
      empty={{
        title: 'No activity yet',
        description: 'Likes, shares and new followers will show up here.',
        icon: <Illustration name="quiet" size="sm" />,
      }}
      endMessage="That's everything"
      gap={0}
      isCompact
    />
  )
}
