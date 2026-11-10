import { Button } from '@astryxdesign/core/Button'
import { Divider } from '@astryxdesign/core/Divider'
import type { DropdownMenuOption } from '@astryxdesign/core/DropdownMenu'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { Timestamp } from '@astryxdesign/core/Timestamp'
import { VStack } from '@astryxdesign/core/VStack'
import { ArrowDownTrayIcon, UserPlusIcon } from '@heroicons/react/24/outline'
import { Fragment, useState, type ReactNode } from 'react'
import { PageLoader } from '@/components/feedback/page-loader'
import { UnavailableScreen } from '@/components/feedback/unavailable-screen'
import { EditDetailsDialog } from '@/components/forms/edit-details-dialog'
import { CollectionHeader } from '@/components/media/collection-header'
import { DetailSection, ExpandableText } from '@/components/media/detail-section'
import { LikeButton, TrackMenu } from '@/components/media/media-rows'
import { OwnerByline } from '@/components/media/owner-byline'
import { useConfirmLeave } from '@/components/navigation/confirm-leave'
import { usePlayContext } from '@/components/player/use-player'
import { ShareDialog, type ShareTab } from '@/components/sharing/share-dialog'
import { SharedWithAvatars } from '@/components/sharing/shared-with-avatars'
import { useSharingState } from '@/components/sharing/use-sharing-state'
import { LIMITS } from '@/config/limits'
import { useIsCompact } from '@/hooks/use-is-compact'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { isNotFound } from '@/lib/api-client'
import { useUsername } from '@/lib/auth/auth-context'
import { trackPath, trackPeoplePath, useCanonicalPath } from '@/lib/links'
import { PREVIEW_CLIP_SECONDS } from '@/lib/share-links'
import { formatDate, formatDuration, toUnixSeconds } from '@/utils/format'
import {
  trackDetailKey,
  useDeleteTrack,
  useDownloadOriginal,
  useRemoveTrackFromLibrary,
  useShareTrack,
  useTrack,
  useTrackLikers,
  useTrackRecipients,
  useUpdateTrack,
  type Track,
} from '../api/tracks'
import { PersonRow } from './person-row'

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`

// One track (the iOS app's track screen, on the web): a cover-tinted header with who made
// it and when, then its genre and description. Its owner also gets sharing, editing and
// deleting, plus who it's shared with and who liked it. Anyone else without access: 404.
// Reached by its readable URL (/{owner}/{slug}, resolved to the id) or its id route /tracks/{id}.
export function TrackPage({ trackId }: { trackId: string }) {
  const me = useUsername()
  const detail = useTrack(trackId)
  const isCompact = useIsCompact()
  const [isSharing, setIsSharing, shareTab] = useSharingState()
  useCanonicalPath(detail.data && trackPath(detail.data))
  // A track's own page plays just that track
  const play = usePlayContext(
    detail.data ? { type: 'TRACK', id: trackId, name: detail.data.name, href: trackPath(detail.data) } : null,
    detail.data ? [detail.data] : [],
  )

  if (detail.isPending) return <PageLoader what="track" />

  if (detail.isError)
    return <UnavailableScreen what="track" isMissing={isNotFound(detail.error)} onRetry={() => void detail.refetch()} />

  const track = detail.data
  const isOwner = track.owner.username === me
  // Wide screens show the date in the header's top-right corner instead; compact, it goes
  // last, so a narrow line cuts the date rather than the details
  const meta = [
    formatDuration(track.duration),
    isOwner &&
      (track.shareCount ? `shared with ${track.shareCount === 1 ? '1 person' : `${track.shareCount} people`}` : 'not shared yet'),
    isOwner && track.likeCount ? plural(track.likeCount, 'like') : null,
    isCompact && `Posted ${formatDate(track.createdAt)}`,
  ]
    .filter(Boolean)
    .join(' · ')

  // Genre and description always show, with a quiet placeholder when blank, so a bare
  // track's page isn't empty below the header
  const sections: { title: string; body: ReactNode }[] = [
    { title: 'Genre', body: track.genre ? <Text type="body">{track.genre}</Text> : <Placeholder>No genre</Placeholder> },
    {
      title: 'Description',
      body: track.description ? <ExpandableText text={track.description} /> : <Placeholder>No description</Placeholder>,
    },
  ]
  if (isOwner) {
    sections.push({ title: 'Shared with', body: <SharedWith track={track} onManage={() => setIsSharing(true)} /> })
    sections.push({
      title: track.likeCount ? `Liked by ${track.likeCount.toLocaleString()}` : 'Liked by',
      body: <LikedBy track={track} />,
    })
  }

  return (
    <VStack gap={5} width="100%">
      <CollectionHeader
        kind="Track"
        title={track.name}
        imageUrl={track.imageUrl}
        imageBgColor={track.imageBgColor}
        byline={<OwnerByline owner={track.owner} hasUsername />}
        meta={meta}
        actions={<TrackActions track={track} isOwner={isOwner} onShare={() => setIsSharing(true)} />}
        play={{ label: `Play ${track.name}`, text: 'Play', ...play }}
        labelEnd={
          <Text type="supporting" color="secondary">
            Posted {formatDate(track.createdAt)}
          </Text>
        }
        aside={isOwner && <SharedWithCorner track={track} onManage={() => setIsSharing(true)} />}
      />

      <VStack gap={4}>
        {sections.map((section, i) => (
          <Fragment key={section.title}>
            {i > 0 && <Divider />}
            <DetailSection title={section.title}>{section.body}</DetailSection>
          </Fragment>
        ))}
      </VStack>

      {isOwner && <TrackShareDialog track={track} isOpen={isSharing} onOpenChange={setIsSharing} initialTab={shareTab} />}
    </VStack>
  )
}

// Who has it (yours, once shared): the avatars, plus Manage access on wide screens. Not on
// phones: the buttons row (Play, Share, like, ⋯) needs the whole width there, and "shared with
// N people" is already in the details line, with everyone listed under Shared with below.
function SharedWithCorner({ track, onManage }: { track: Track; onManage: () => void }) {
  const isCompact = useIsCompact()
  const isMobile = useIsMobile()
  const recipients = useTrackRecipients(track.id, !isMobile)
  if (isMobile || !recipients.data?.length) return null
  return (
    <HStack gap={3} vAlign="center">
      <SharedWithAvatars recipients={recipients.data} onClick={onManage} />
      {!isCompact && <Button label="Manage access" variant="secondary" size="sm" onClick={onManage} />}
    </HStack>
  )
}

function Placeholder({ children }: { children: ReactNode }) {
  return (
    <Text type="body" color="secondary">
      {children}
    </Text>
  )
}

// Header actions. Everyone: play, like, add to a playlist. Owners also share, edit and
// delete; recipients can take it out of their library (the mirror of the owner unsharing).
function TrackActions({ track, isOwner, onShare }: { track: Track; isOwner: boolean; onShare: () => void }) {
  const update = useUpdateTrack(track.id)
  const remove = useDeleteTrack(track.id)
  const leave = useRemoveTrackFromLibrary(track.id)
  const download = useDownloadOriginal(track.id)
  const [isEditing, setIsEditing] = useState(false)
  const confirmLeave = useConfirmLeave({
    what: 'track',
    name: track.name,
    detailKey: trackDetailKey(track.id),
    delete: {
      mutation: remove,
      description:
        "It goes for good: everyone you shared it with loses it, it leaves your albums, and it shows as unavailable in people's playlists.",
    },
    leave: {
      mutation: leave,
      description:
        "It leaves your library and feed. If it's also in an album shared with you, you'll still have it there. Only the owner can share it with you again.",
    },
  })

  const menuItems: DropdownMenuOption[] = isOwner
    ? [
        { label: 'Edit details', onClick: () => setIsEditing(true) },
        // The file exactly as uploaded (wav, flac…), not the streaming copy
        { label: 'Download original', icon: ArrowDownTrayIcon, onClick: () => download.mutate() },
        { type: 'divider' },
        { label: 'Delete track', variant: 'destructive', onClick: () => confirmLeave.ask('delete') },
      ]
    : [
        { type: 'divider' },
        { label: 'Remove from my library', variant: 'destructive', onClick: () => confirmLeave.ask('leave') },
      ]

  return (
    <>
      {isOwner && <Button label="Share" variant="secondary" icon={<Icon icon={UserPlusIcon} />} onClick={onShare} />}
      <LikeButton kind="TRACK" id={track.id} liked={track.likedByMe} name={track.name} />
      <TrackMenu track={track} extraItems={menuItems} />

      {isOwner && (
        <EditDetailsDialog
          isOpen={isEditing}
          onOpenChange={setIsEditing}
          title="Edit track"
          initial={{ name: track.name, genre: track.genre ?? '', description: track.description ?? '' }}
          descriptionLimit={LIMITS.trackDescription}
          cover={{ imageUrl: track.imageUrl, imageBgColor: track.imageBgColor }}
          url={track.slug ? { pathPrefix: `/${track.owner.username}/`, slug: track.slug } : undefined}
          isSaving={update.isPending}
          onSave={({ name, genre, description, cover, slug }) =>
            update.mutateAsync({ name, genre: genre ?? '', description, cover: cover.file, clearCover: cover.clear, slug })
          }
        />
      )}
      {confirmLeave.dialog}
    </>
  )
}

function TrackShareDialog({ track, isOpen, onOpenChange, initialTab }: {
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
      subtitle="They can listen to it and add it to their playlists."
      recipients={recipients}
      share={share}
      links={{ kind: 'TRACK', id: track.id, isShortTrack: track.duration <= PREVIEW_CLIP_SECONDS }}
      initialTab={initialTab}
    />
  )
}

/** How many people the Shared with / Liked by sections show before "See all". */
const PREVIEW = 3

// "See all (24)" under a section that has more than it shows, to the full list's screen
function SeeAll({ href, count }: { href: string; count: number }) {
  return (
    <Link href={href} type="supporting" weight="semibold" color="primary">
      See all ({count.toLocaleString()})
    </Link>
  )
}

// Owner-only: the first few people it's shared with directly (album shares grant access
// too, but are managed on the album), "See all" for the rest, and Manage access
function SharedWith({ track, onManage }: { track: Track; onManage: () => void }) {
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
            Shared <Timestamp value={toUnixSeconds(recipient.sharedAt)} format="relative" />
          </PersonRow>
        ))}
      </VStack>
      <HStack gap={4} vAlign="center">
        {/* Sharing with someone new is the header's Share; this is for the people listed */}
        <Button label="Manage access" variant="secondary" size="sm" onClick={onManage} />
        {recipients.data.length > PREVIEW && (
          <SeeAll href={trackPeoplePath(track, 'shared-with')} count={recipients.data.length} />
        )}
      </HStack>
    </VStack>
  )
}

// Owner-only: the most recent few who liked it, "See all" for the rest. Nothing yet is
// one quiet line, like Shared with.
function LikedBy({ track }: { track: Track }) {
  const likers = useTrackLikers(track.id, true)

  if (likers.isPending) return <PageLoader compact what="likes" />
  const firstPage = likers.data?.pages[0]
  if (likers.isError || !firstPage) {
    return (
      <Text type="supporting" color="secondary">
        Couldn't load who liked it.
      </Text>
    )
  }
  if (firstPage.items.length === 0) {
    return (
      <Text type="supporting" color="secondary">
        No likes yet.
      </Text>
    )
  }
  const total = track.likeCount ?? firstPage.items.length
  return (
    <VStack gap={2}>
      <VStack gap={0}>
        {firstPage.items.slice(0, PREVIEW).map((liker) => (
          <PersonRow key={liker.user.username} user={liker.user}>
            Liked <Timestamp value={toUnixSeconds(liker.likedAt)} format="relative" />
          </PersonRow>
        ))}
      </VStack>
      {(firstPage.items.length > PREVIEW || firstPage.nextCursor) && (
        <SeeAll href={trackPeoplePath(track, 'likes')} count={Math.max(total, firstPage.items.length)} />
      )}
    </VStack>
  )
}
