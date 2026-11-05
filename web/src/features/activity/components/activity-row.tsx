import { Avatar } from '@astryxdesign/core/Avatar'
import { Item } from '@astryxdesign/core/Item'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { Timestamp } from '@astryxdesign/core/Timestamp'
import { activityTargetPath, profilePath } from '@/lib/links'
import { nameOf } from '@/types/user'
import { toUnixSeconds } from '@/utils/format'
import type { ActivityEntry } from '../api/activity'

function hrefFor(entry: ActivityEntry): string {
  if (entry.targetType === 'USER') return profilePath(entry.actor.username)
  return activityTargetPath(entry.targetType, entry.targetId, entry.targetOwner, entry.targetSlug)
}

function Sentence({ entry }: { entry: ActivityEntry }) {
  const actor = <Text weight="semibold">{nameOf(entry.actor)}</Text>
  const target = <Text weight="semibold">{entry.targetName ?? 'something'}</Text>
  switch (entry.type) {
    case 'TRACK_LIKED':
      return <>{actor} liked your track {target}</>
    case 'ALBUM_LIKED':
      return <>{actor} liked your album {target}</>
    case 'TRACK_SHARED':
      return <>{actor} shared {target} with you</>
    case 'ALBUM_SHARED':
      return <>{actor} shared the album {target} with you</>
    case 'USER_FOLLOWED':
      return <>{actor} started following you</>
  }
}

export function ActivityRow({ entry, isUnread }: { entry: ActivityEntry; isUnread: boolean }) {
  return (
    <Item
      href={hrefFor(entry)}
      align="start"
      startContent={
        <Avatar
          size="md"
          src={entry.actor.imageUrl ?? undefined}
          name={nameOf(entry.actor)}
          tooltip={false}
        />
      }
      label={
        <Text type="body" textWrap="pretty">
          <Sentence entry={entry} />
        </Text>
      }
      description={<Timestamp value={toUnixSeconds(entry.createdAt)} format="relative" />}
      endContent={isUnread ? <StatusDot variant="accent" label="New" /> : undefined}
    />
  )
}
