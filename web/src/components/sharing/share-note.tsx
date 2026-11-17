import { Avatar } from '@astryxdesign/core/Avatar'
import { HStack } from '@astryxdesign/core/HStack'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { TimeAgo } from '@/components/feedback/time-ago'
import { profilePath } from '@/lib/links'
import type { ShareNote as Share, UserSummary } from '@/types/api'
import { nameOf } from '@/types/user'
import { CaptionBox } from './caption-box'

// What the owner said when they shared a track or album with you, under its header: a
// note from them — their photo and name (a person, not a section label), when, then the
// caption in the same tinted box as on Home. Only when there's a caption: the owner's byline already says who it's from.
export function ShareNote({
  share,
  from,
  colour,
}: {
  share: Share | undefined
  from: UserSummary
  /** The track's/album's cover colour, for the caption's wash (as on Home) */
  colour?: string | null
}) {
  if (!share?.caption) return null
  const name = nameOf(from)
  return (
    <VStack gap={2}>
      {/* Two lines beside their photo: who, then what and when — so nothing wraps awkwardly */}
      <HStack gap={3} vAlign="center">
        <Avatar size="sm" src={from.imageUrl ?? undefined} name={name} tooltip={false} />
        <VStack gap={0}>
          <Link href={profilePath(from.username)} color="primary" weight="semibold">
            {name}
          </Link>
          <Text type="supporting" color="secondary">
            Shared this with you · <TimeAgo ms={share.sharedAt} />
          </Text>
        </VStack>
      </HStack>
      <CaptionBox text={share.caption} colour={colour} />
    </VStack>
  )
}
