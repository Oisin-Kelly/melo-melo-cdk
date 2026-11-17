import { Avatar } from '@astryxdesign/core/Avatar'
import { HStack } from '@astryxdesign/core/HStack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { TimeAgo } from '@/components/feedback/time-ago'
import { AlbumRow, TrackRow } from '@/components/media/media-rows'
import { CaptionBox } from '@/components/sharing/caption-box'
import { profilePath } from '@/lib/links'
import { nameOf } from '@/types/user'
import type { FeedEntry as Entry } from '../api/feed'

// One share in the Home feed: who sent it and when (a dot after it while it's new since
// your last visit, like an unread activity row), their caption, then the track or album.
export function FeedEntry({ entry, isNew = false }: { entry: Entry; isNew?: boolean }) {
  const sender = nameOf(entry.sender)
  const { track, album } = entry
  return (
    <VStack gap={2} className="mm-feed-entry">
      <HStack gap={2} vAlign="center">
        <Avatar size="sm" src={entry.sender.imageUrl ?? undefined} name={sender} href={profilePath(entry.sender.username)} />
        <Text type="body" maxLines={1}>
          <Text weight="semibold">{sender}</Text>{' '}
          <Text color="secondary">shared {entry.type === 'TRACK' ? 'a track' : 'an album'} ·</Text>{' '}
          <TimeAgo ms={entry.sharedAt} />
        </Text>
        {isNew && <StatusDot variant="accent" label="New" />}
      </HStack>

      {entry.caption && <CaptionBox text={entry.caption} colour={track?.imageBgColor ?? album?.imageBgColor} />}

      {track && <TrackRow track={track} variant="card" />}
      {album && <AlbumRow album={album} variant="card" />}
    </VStack>
  )
}
