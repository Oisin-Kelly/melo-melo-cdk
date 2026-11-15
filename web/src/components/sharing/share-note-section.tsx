import { Text } from '@astryxdesign/core/Text'
import { Timestamp } from '@astryxdesign/core/Timestamp'
import { VStack } from '@astryxdesign/core/VStack'
import { DetailSection, ExpandableText } from '@/components/media/detail-section'
import type { ShareNote } from '@/types/api'
import { nameOf } from '@/types/user'
import { toUnixSeconds } from '@/utils/format'

// What the owner said when they shared a track or album with you, under its header — the
// same quote Home and their profile show. Only when there's a caption: the owner's byline
// already says who it's from.

/** The quote and when it was shared (for a page that labels its own sections, "From Bob"). */
export function ShareNoteBody({ caption, sharedAt }: { caption: string; sharedAt: number }) {
  return (
    <VStack gap={1}>
      <ExpandableText text={`“${caption}”`} />
      <Text type="supporting" color="secondary">
        Shared <Timestamp value={toUnixSeconds(sharedAt)} format="relative" />
      </Text>
    </VStack>
  )
}

/** The labelled section, or nothing without a caption. */
export function ShareNoteSection({
  share,
  owner,
}: {
  share: ShareNote | undefined
  owner: { username: string; displayName: string | null }
}) {
  if (!share?.caption) return null
  return (
    <DetailSection title={`From ${nameOf(owner)}`}>
      <ShareNoteBody caption={share.caption} sharedAt={share.sharedAt} />
    </DetailSection>
  )
}
