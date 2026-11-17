import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/HStack'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { PageLoader } from '@/components/feedback/page-loader'
import { TimeAgo } from '@/components/feedback/time-ago'
import { ShareDialog, type ShareTab } from '@/components/sharing/share-dialog'
import { trackPeoplePath } from '@/lib/links'
import { useShareTrack, useTrackRecipients, type Track } from '../api/tracks'
import { PersonRow } from './person-row'

// A track's sharing, for its owner: the Share dialog (people + links) and the Shared with
// preview. Used by the track page and the Edit track page.

export function TrackShareDialog({ track, isOpen, onOpenChange, initialTab }: {
  track: Track
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  initialTab: ShareTab
}) {
  const recipients = useTrackRecipients(track.id, isOpen)
  const share = useShareTrack(track.id)
  return (
    <ShareDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      name={track.name}
      kind="track"
      recipients={recipients}
      share={share}
      links={{ kind: 'TRACK', id: track.id }}
      initialTab={initialTab}
    />
  )
}

/** How many people the Shared with / Liked by sections show before "See all". */
export const PREVIEW = 3

// "See all (24)" under a section that has more than it shows, to the full list's screen
export function SeeAll({ href, count }: { href: string; count: number }) {
  return (
    <Link href={href} type="supporting" weight="semibold" color="primary">
      See all ({count.toLocaleString()})
    </Link>
  )
}

// Owner-only: the first few people it's shared with directly (album shares grant access
// too, but are managed on the album), "See all" for the rest, and Manage access
export function SharedWith({
  track,
  onManage,
  hasManageButton = true,
}: {
  track: Track
  onManage: () => void
  /** Off where the page has its own Manage access (Edit track). */
  hasManageButton?: boolean
}) {
  const recipients = useTrackRecipients(track.id, true)

  if (recipients.isPending) return <PageLoader compact what="sharedWith" />
  if (recipients.isError) {
    return (
      <Text type="supporting" color="secondary">
        Couldn't load who it's shared with.
      </Text>
    )
  }
  if (recipients.data.length === 0) {
    return (
      <Text type="supporting" color="secondary">
        Not shared with anyone yet.
      </Text>
    )
  }
  return (
    <VStack gap={2}>
      <VStack gap={0}>
        {recipients.data.slice(0, PREVIEW).map((recipient) => (
          <PersonRow key={recipient.user.username} user={recipient.user}>
            Shared <TimeAgo ms={recipient.sharedAt} />
          </PersonRow>
        ))}
      </VStack>
      <HStack gap={4} vAlign="center">
        {/* Sharing with someone new is the header's Share; this is for the people listed */}
        {hasManageButton && <Button label="Manage access" variant="secondary" size="sm" onClick={onManage} />}
        {recipients.data.length > PREVIEW && (
          <SeeAll href={trackPeoplePath(track, 'shared-with')} count={recipients.data.length} />
        )}
      </HStack>
    </VStack>
  )
}
