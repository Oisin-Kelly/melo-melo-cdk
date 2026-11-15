import { Button } from '@astryxdesign/core/Button'
import { DropdownMenu, type DropdownMenuOption } from '@astryxdesign/core/DropdownMenu'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { VStack } from '@astryxdesign/core/VStack'
import {
  EllipsisHorizontalIcon,
  ForwardIcon,
  MinusCircleIcon,
  PencilIcon,
  QueueListIcon,
  TrashIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline'
import { useState } from 'react'
import { PageLoader } from '@/components/feedback/page-loader'
import { UnavailableScreen } from '@/components/feedback/unavailable-screen'
import { EditDetailsDialog } from '@/components/forms/edit-details-dialog'
import { Illustration } from '@/components/illustrations/illustration'
import { InfiniteList } from '@/components/lists/infinite-list'
import { CollectionHeader } from '@/components/media/collection-header'
import { DetailSection, ExpandableText } from '@/components/media/detail-section'
import { ShareNoteSection } from '@/components/sharing/share-note-section'
import { LikeButton, TrackRow } from '@/components/media/media-rows'
import { OwnerByline } from '@/components/media/owner-byline'
import { useConfirmLeave } from '@/components/navigation/confirm-leave'
import { allPages } from '@/components/player/all-pages'
import type { PlayContext } from '@/components/player/queue'
import { TrackListPlayback } from '@/components/player/track-list-playback'
import type { TrackSource } from '@/components/player/player'
import { usePlayContext, useQueueActions } from '@/components/player/use-player'
import { SharedWithAvatars } from '@/components/sharing/shared-with-avatars'
import { useSharingState } from '@/components/sharing/use-sharing-state'
import { useIsCompact } from '@/hooks/use-is-compact'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { isNotFound } from '@/lib/api-client'
import { albumPath, useCanonicalPath } from '@/lib/links'
import { formatLength } from '@/utils/format'
import {
  albumDetailKey,
  useAlbumDetail,
  useAlbumRecipients,
  useDeleteAlbum,
  useRemoveAlbumFromLibrary,
  useUpdateAlbum,
  type Album,
} from '../api/albums'
import { ShareAlbumDialog } from './share-album-dialog'

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`

// Header actions. Owners share, edit and delete; recipients can like it or take it
// out of their library (the mirror of the owner unsharing).
function AlbumActions({
  album,
  isOwner,
  onShare,
  playContext,
  playTracks,
}: {
  album: Album
  isOwner: boolean
  onShare: () => void
  playContext: PlayContext | null
  playTracks: TrackSource
}) {
  const queue = useQueueActions()
  const update = useUpdateAlbum(album.id)
  const remove = useDeleteAlbum(album.id)
  const leave = useRemoveAlbumFromLibrary(album.id)
  const [isEditing, setIsEditing] = useState(false)
  const confirmLeave = useConfirmLeave({
    what: 'album',
    name: album.name,
    detailKey: albumDetailKey(album.id),
    delete: {
      mutation: remove,
      description:
        "The album goes for good, and the people you shared it with lose access to its tracks (unless you've shared a track with them directly). The tracks themselves stay in your library.",
    },
    leave: {
      mutation: leave,
      description:
        'It leaves your library and feed, and you lose access to its tracks unless they were also shared with you directly. Only the owner can share it with you again.',
    },
  })

  // The whole album into the queue (with nothing playing, it just plays)
  const queueItems: DropdownMenuOption[] =
    queue && playContext
      ? [
          { label: 'Play next', icon: ForwardIcon, onClick: () => queue.playNext(playTracks, playContext) },
          { label: 'Add to queue', icon: QueueListIcon, onClick: () => queue.addToQueue(playTracks, playContext) },
          { type: 'divider' },
        ]
      : []
  const menu: DropdownMenuOption[] = isOwner
    ? [
        ...queueItems,
        { label: 'Edit details', icon: PencilIcon, onClick: () => setIsEditing(true) },
        { type: 'divider' },
        { label: 'Delete album', icon: TrashIcon, variant: 'destructive', onClick: () => confirmLeave.ask('delete') },
      ]
    : [...queueItems, { label: 'Remove from my library', icon: MinusCircleIcon, variant: 'destructive', onClick: () => confirmLeave.ask('leave') }]

  return (
    <>
      {isOwner && <Button label="Share" variant="secondary" icon={<Icon icon={UserPlusIcon} />} onClick={onShare} />}
      <LikeButton kind="ALBUM" id={album.id} liked={album.likedByMe} name={album.name} />
      <DropdownMenu
        renderTrigger={(props) => (
          <IconButton {...props} label="More album options" variant="ghost" icon={<Icon icon={EllipsisHorizontalIcon} />} />
        )}
        items={menu}
      />

      {isOwner && (
        <EditDetailsDialog
          isOpen={isEditing}
          onOpenChange={setIsEditing}
          title="Edit album"
          initial={{ name: album.name, description: album.description ?? '' }}
          cover={{ imageUrl: album.imageUrl, imageBgColor: album.imageBgColor }}
          url={album.slug && album.owner ? { pathPrefix: `/${album.owner.username}/albums/`, slug: album.slug } : undefined}
          isSaving={update.isPending}
          onSave={(details) => update.mutateAsync(details)}
        />
      )}
      {confirmLeave.dialog}
    </>
  )
}

// Who has it (yours, once shared): the avatars (they open the share dialog), plus Manage access
// on wide screens. Not on phones: the buttons row needs the whole width there, and the size
// line already says who it's shared with.
function SharedWith({ album, onManage }: { album: Album; onManage: () => void }) {
  const isCompact = useIsCompact()
  const isMobile = useIsMobile()
  const recipients = useAlbumRecipients(album.id, !isMobile)
  if (isMobile || !recipients.data?.length) return null
  return (
    <HStack gap={3} vAlign="center">
      <SharedWithAvatars recipients={recipients.data} onClick={onManage} />
      {!isCompact && <Button label="Manage access" variant="secondary" size="sm" onClick={onManage} />}
    </HStack>
  )
}

// One album: header with cover, owner and actions, then its tracklist in order.
// Visible to the owner and the people it's shared with; anyone else gets a 404.
// Reached by its readable URL (/{owner}/albums/{slug}, resolved to the id) or its id route /albums/{id}.
export function AlbumPage({ albumId }: { albumId: string }) {
  const detail = useAlbumDetail(albumId)
  const isCompact = useIsCompact()
  const [isSharing, setIsSharing, shareTab] = useSharingState()
  const firstPage = detail.data?.pages[0]
  const album = firstPage?.album
  // Every track is the owner's, so a track's owner stands in if `owner` is missing
  const owner = album?.owner ?? firstPage?.items[0]?.owner
  useCanonicalPath(album && owner && albumPath({ ...album, owner }))
  // Play all, or a tapped row: the whole album, every page of it, in its own order
  const playContext: PlayContext | null =
    album && owner ? { type: 'ALBUM', id: albumId, name: album.name, href: albumPath({ ...album, owner }) } : null
  const playTracks = async () => (await allPages(detail)).flatMap((page) => page.items)
  const play = usePlayContext(playContext, playTracks)

  if (detail.isPending) return <PageLoader what="album" />

  if (!album)
    return <UnavailableScreen what="album" isMissing={isNotFound(detail.error)} onRetry={() => void detail.refetch()} />

  // shareCount is owner-only, so it's present exactly when this is your album
  const isOwner = album.shareCount !== undefined

  const meta = [
    plural(album.trackCount, 'track'),
    album.totalDurationSeconds > 0 && formatLength(album.totalDurationSeconds),
    isOwner && (album.shareCount ? `shared with ${album.shareCount === 1 ? '1 person' : `${album.shareCount} people`}` : 'not shared yet'),
    isOwner && album.likeCount ? plural(album.likeCount, 'like') : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <VStack gap={5} width="100%">
      {/* Shared with you: the album's size rides on the byline instead of a meta line */}
      <CollectionHeader
        kind="Album"
        title={album.name}
        imageUrl={album.imageUrl}
        imageBgColor={album.imageBgColor}
        byline={owner && <OwnerByline owner={owner} detail={isOwner ? undefined : meta} />}
        meta={isOwner || !owner ? meta : undefined}
        actions={
          <AlbumActions
            album={album}
            isOwner={isOwner}
            onShare={() => setIsSharing(true)}
            playContext={playContext}
            playTracks={playTracks}
          />
        }
        play={{ label: 'Play album', text: 'Play all', ...play }}
        description={isCompact ? album.description : undefined}
        aside={isOwner && <SharedWith album={album} onManage={() => setIsSharing(true)} />}
      />
      {owner && <ShareNoteSection share={album.myShare} owner={owner} />}
      {album.description && !isCompact && (
        <DetailSection title="Description">
          <ExpandableText text={album.description} />
        </DetailSection>
      )}
      {isOwner && <ShareAlbumDialog album={album} isOpen={isSharing} onOpenChange={setIsSharing} initialTab={shareTab} />}

      <TrackListPlayback context={playContext} tracks={playTracks}>
        <InfiniteList
          loadingWhat="album"
          query={detail}
          getKey={(track) => track.id}
          empty={{
            title: 'No tracks in this album yet',
            description: isOwner ? 'Adding tracks to albums is coming soon.' : undefined,
            icon: <Illustration name="music" />,
          }}
          endMessage={null}
          renderItem={(track) => <TrackRow track={track} />}
        />
      </TrackListPlayback>
    </VStack>
  )
}
