import { Avatar } from '@astryxdesign/core/Avatar'
import { HStack } from '@astryxdesign/core/HStack'
import { Text } from '@astryxdesign/core/Text'
import { Timestamp } from '@astryxdesign/core/Timestamp'
import { VStack } from '@astryxdesign/core/VStack'
import { ExpandableText } from '@/components/media/detail-section'
import { AlbumRow, TrackRow } from '@/components/media/media-rows'
import { tint } from '@/components/media/tint'
import { profilePath } from '@/lib/links'
import { nameOf } from '@/types/user'
import { toUnixSeconds } from '@/utils/format'
import type { FeedEntry as Entry } from '../api/feed'
import './feed.css'

// One share in the Home feed: who sent it and when, their caption, then the track or album.
export function FeedEntry({ entry }: { entry: Entry }) {
  const sender = nameOf(entry.sender)
  const { track, album } = entry
  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="center">
        <Avatar size="sm" src={entry.sender.imageUrl ?? undefined} name={sender} href={profilePath(entry.sender.username)} />
        <Text type="body" maxLines={1}>
          <Text weight="semibold">{sender}</Text>{' '}
          <Text color="secondary">shared {entry.type === 'TRACK' ? 'a track' : 'an album'} ·</Text>{' '}
          <Timestamp value={toUnixSeconds(entry.sharedAt)} format="relative" />
        </Text>
      </HStack>

      {entry.caption && (
        <div className="mm-feed-caption" style={tint(track?.imageBgColor ?? album?.imageBgColor)}>
          <VStack paddingInline={3} paddingBlock={2}>
            <ExpandableText text={entry.caption} />
          </VStack>
        </div>
      )}

      {track && <TrackRow track={track} variant="card" />}
      {album && <AlbumRow album={album} variant="card" />}
    </VStack>
  )
}
