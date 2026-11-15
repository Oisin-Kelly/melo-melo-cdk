import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Button } from '@astryxdesign/core/Button'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Timestamp } from '@astryxdesign/core/Timestamp'
import { VStack } from '@astryxdesign/core/VStack'
import {
  EllipsisHorizontalIcon,
  ForwardIcon,
  MinusCircleIcon,
  PencilIcon,
  QueueListIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { PageLoader } from '@/components/feedback/page-loader'
import { UnavailableScreen } from '@/components/feedback/unavailable-screen'
import { EditDetailsDialog } from '@/components/forms/edit-details-dialog'
import { Illustration } from '@/components/illustrations/illustration'
import { InfiniteList } from '@/components/lists/infinite-list'
import { SortMenu } from '@/components/lists/sort-menu'
import { CollectionHeader } from '@/components/media/collection-header'
import { CoverArt } from '@/components/media/cover-art'
import { DetailSection, ExpandableText } from '@/components/media/detail-section'
import { LikedCover } from '@/components/media/liked-cover'
import { MediaRow, TrackRow } from '@/components/media/media-rows'
import { OwnerByline } from '@/components/media/owner-byline'
import { useConfirmLeave } from '@/components/navigation/confirm-leave'
import { allPages } from '@/components/player/all-pages'
import type { PlayContext } from '@/components/player/queue'
import { TrackListPlayback } from '@/components/player/track-list-playback'
import type { TrackSource } from '@/components/player/player'
import { usePlayContext, useQueueActions } from '@/components/player/use-player'
import { useIsCompact } from '@/hooks/use-is-compact'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { isNotFound } from '@/lib/api-client'
import { useUsername } from '@/lib/auth/auth-context'
import { playlistPath, useCanonicalPath } from '@/lib/links'
import { useMe } from '@/lib/me'
import { playlistDetailKey, type Playlist, type PlaylistTrackEntry } from '@/lib/playlists'
import { formatDate, formatDuration, formatLength, toUnixSeconds } from '@/utils/format'
import { useDeletePlaylist, usePlaylistDetail, useRemoveFromPlaylist, useUpdatePlaylist } from '../api/playlists'
import {
  comparePlaylistEntries,
  LIKES_SORT_OPTIONS,
  type LikesSort,
  matchesEntry,
  parsePlaylistSort,
  PLAYLIST_SORT_OPTIONS,
  type PlaylistSort,
} from '../utils/arrange-entries'
import { ExpandingSearch, PhoneSearchRow } from './playlist-search'

// A playlist is private, so its owner is always you
function MyByline() {
  const username = useUsername()
  const me = useMe()
  return <OwnerByline owner={me.data ?? { username, displayName: null, imageUrl: null, imageBgColor: null }} />
}

const REASON: Record<NonNullable<PlaylistTrackEntry['reason']>, string> = {
  DELETED: 'Deleted by its owner',
  REVOKED: 'No longer shared with you',
}

// A track that's gone (deleted, or its share withdrawn): kept in the playlist so you
// can see what it was and remove it yourself, rather than silently vanishing.
function UnavailableRow({ entry, onRemove }: { entry: PlaylistTrackEntry; onRemove: () => void }) {
  const isMobile = useIsMobile()
  return (
    <MediaRow colour={null}>
      <CoverArt imageUrl={null} imageBgColor={null} size="sm" />
      <StackItem size="fill">
        <VStack gap={0.5}>
          <Text weight="bold" color="secondary" maxLines={1}>
            {entry.name}
          </Text>
          <Text type="supporting" color="secondary" maxLines={1}>
            {REASON[entry.reason ?? 'DELETED']} · {formatDuration(entry.duration)}
          </Text>
        </VStack>
      </StackItem>
      {/* Phones: an icon, as the row is too narrow for the text button */}
      {isMobile ? (
        <IconButton label="Remove" tooltip="Remove" variant="ghost" icon={<Icon icon={XMarkIcon} />} onClick={onRemove} />
      ) : (
        <Button label="Remove" variant="secondary" size="sm" onClick={onRemove} />
      )}
    </MediaRow>
  )
}

function PlaylistActions({
  playlist,
  playContext,
  playTracks,
}: {
  playlist: Playlist
  playContext: PlayContext | null
  playTracks: TrackSource
}) {
  const me = useUsername()
  const queue = useQueueActions()
  const update = useUpdatePlaylist(playlist.id)
  const remove = useDeletePlaylist(playlist.id)
  const [isEditing, setIsEditing] = useState(false)
  const confirmLeave = useConfirmLeave({
    what: 'playlist',
    name: playlist.name,
    detailKey: playlistDetailKey(playlist.id),
    fallback: '/library',
    delete: { mutation: remove, description: "The playlist goes for good. The tracks in it aren't affected." },
  })

  return (
    <>
      <Button label="Edit" variant="secondary" icon={<Icon icon={PencilIcon} />} onClick={() => setIsEditing(true)} />
      <DropdownMenu
        renderTrigger={(props) => (
          <IconButton {...props} label="More playlist options" variant="ghost" icon={<Icon icon={EllipsisHorizontalIcon} />} />
        )}
        items={[
          // The whole playlist into the queue (with nothing playing, it just plays)
          ...(queue && playContext
            ? [
                { label: 'Play next', icon: ForwardIcon, onClick: () => queue.playNext(playTracks, playContext) },
                { label: 'Add to queue', icon: QueueListIcon, onClick: () => queue.addToQueue(playTracks, playContext) },
                { type: 'divider' as const },
              ]
            : []),
          { label: 'Delete playlist', icon: TrashIcon, variant: 'destructive', onClick: () => confirmLeave.ask('delete') },
        ]}
      />

      <EditDetailsDialog
        isOpen={isEditing}
        onOpenChange={setIsEditing}
        title="Edit playlist"
        initial={{ name: playlist.name, description: playlist.description ?? '' }}
        cover={{ imageUrl: playlist.imageUrl, imageBgColor: playlist.imageBgColor }}
        url={playlist.slug ? { pathPrefix: `/${me}/playlists/`, slug: playlist.slug } : undefined}
        isSaving={update.isPending}
        onSave={(details) => update.mutateAsync(details)}
      />
      {confirmLeave.dialog}
    </>
  )
}

// Search box + sort menu over the track list. Both live in the URL (?q=, ?sort=), so
// Back and shared links keep them; every visit otherwise opens in the playlist's order.
function usePlaylistView() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const sort = parsePlaylistSort(params.get('sort'))
  const update = (next: { q?: string; sort?: PlaylistSort }) =>
    setParams(
      (current) => {
        const result = new URLSearchParams(current)
        const q = next.q ?? query
        const s = next.sort ?? sort
        if (q) result.set('q', q)
        else result.delete('q')
        if (s !== 'playlist') result.set('sort', s)
        else result.delete('sort')
        return result
      },
      { replace: true },
    )
  return { query, sort, setQuery: (q: string) => update({ q }), setSort: (s: PlaylistSort) => update({ sort: s }) }
}

// One playlist: header with its details and actions, then its tracks in order, including
// placeholders for tracks that have since gone. Reached by its readable URL
// (/{me}/playlists/{slug}, resolved to the id) or its id route /playlists/{id}.
// The built-in likes playlist is this page too, at /liked: "Liked tracks" with a heart
// for a cover, newest like first. It changes only by liking, so no Edit/Delete or
// Remove — a row's heart is how a track leaves (and it stays until the next visit, so a
// mis-tap can be undone in place); each row says when you liked it.
export function PlaylistPage({ playlistId }: { playlistId: string }) {
  const me = useUsername()
  const detail = usePlaylistDetail(playlistId)
  const removeTrack = useRemoveFromPlaylist(playlistId)
  const playlist = detail.data?.pages[0]?.playlist
  const isCompact = useIsCompact()
  const isMobile = useIsMobile()
  const view = usePlaylistView()
  // Phones: the magnifier opens the search box and swaps the header for the results until Cancel
  const [isSearchMode, setIsSearchMode] = useState(() => view.query !== '')
  // The entry waiting on "Remove …?" (available tracks and gone ones alike)
  const [removing, setRemoving] = useState<PlaylistTrackEntry | null>(null)
  useCanonicalPath(playlist && playlistPath(playlist, me))
  // Play all: every track you can still play, in the order shown (the sort, not the search)
  const playSort = playlist?.type === 'LIKES' && view.sort === 'added' ? 'playlist' : view.sort
  const playContext: PlayContext | null = playlist
    ? {
        type: 'PLAYLIST',
        id: playlistId,
        name: playlist.type === 'LIKES' ? 'Liked tracks' : playlist.name,
        href: playlistPath(playlist, me),
      }
    : null
  const playTracks = async () => {
    const entries = (await allPages(detail)).flatMap((page) => page.items)
    const compare = comparePlaylistEntries(playSort)
    return (compare ? [...entries].sort(compare) : entries).flatMap((entry) =>
      entry.track && !entry.unavailable ? [entry.track] : [],
    )
  }
  const play = usePlayContext(playContext, playTracks)

  if (detail.isPending) return <PageLoader what="playlist" />

  if (!playlist)
    return <UnavailableScreen what="playlist" isMissing={isNotFound(detail.error)} onRetry={() => void detail.refetch()} />

  const { trackCount, totalDurationSeconds } = playlist
  const isLikes = playlist.type === 'LIKES'
  // A "Recently added" link (?sort=added) means the likes playlist's own order
  const likesSort: LikesSort = view.sort === 'added' ? 'playlist' : view.sort
  const isSearching = view.query.trim() !== ''
  const hasTools = trackCount > 0
  const sortMenu = isLikes ? (
    <SortMenu value={likesSort} options={LIKES_SORT_OPTIONS} onChange={view.setSort} />
  ) : (
    <SortMenu value={view.sort} options={PLAYLIST_SORT_OPTIONS} onChange={view.setSort} />
  )
  const sort = isLikes ? likesSort : view.sort
  const searchProps = { value: view.query, onChange: view.setQuery }
  const isCollapsed = isMobile && isSearchMode
  const cancelSearch = () => {
    view.setQuery('')
    setIsSearchMode(false)
  }
  const created = `Created ${formatDate(playlist.createdAt)}`
  // Wide screens show the created date in the header's top-right corner; compact ones
  // leave it out, keeping the header short enough to show the first tracks
  const meta = [
    `${trackCount} ${trackCount === 1 ? 'track' : 'tracks'}`,
    totalDurationSeconds > 0 && formatLength(totalDurationSeconds),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <VStack gap={5} width="100%">
      <CollectionHeader
        backFallback="/library"
        kind="Playlist"
        title={isLikes ? 'Liked tracks' : playlist.name}
        imageUrl={playlist.imageUrl}
        // The likes playlist: no colour of its own, so the header takes the accent wash
        imageBgColor={isLikes ? null : playlist.imageBgColor}
        cover={isLikes ? <LikedCover size={isCompact ? 'lg' : 'xl'} /> : undefined}
        byline={<MyByline />}
        meta={meta}
        labelEnd={
          !isLikes && (
            <Text type="supporting" color="secondary">
              {created}
            </Text>
          )
        }
        actions={!isLikes && <PlaylistActions playlist={playlist} playContext={playContext} playTracks={playTracks} />}
        play={{ label: isLikes ? 'Play liked tracks' : 'Play playlist', text: 'Play all', ...play }}
        description={isCompact ? playlist.description : undefined}
        backEnd={
          hasTools &&
          isMobile && (
            <PhoneSearchRow
              {...searchProps}
              isOpen={isSearchMode}
              onOpen={() => setIsSearchMode(true)}
              onCancel={cancelSearch}
              sortMenu={sortMenu}
            />
          )
        }
        isCollapsed={isCollapsed}
        aside={
          hasTools &&
          !isMobile && (
            <HStack gap={2} vAlign="center">
              <ExpandingSearch {...searchProps} />
              {sortMenu}
            </HStack>
          )
        }
      />
      {playlist.description && !isCompact && (
        <DetailSection title="Description">
          <ExpandableText text={playlist.description} />
        </DetailSection>
      )}

      {/* A tapped row plays the playlist from there, in the order shown */}
      <TrackListPlayback context={playContext} tracks={playTracks}>
        <InfiniteList
          loadingWhat="playlist"
          query={detail}
          getKey={(entry) => entry.trackId}
          loadAll={isSearching || sort !== 'playlist'}
          filter={isSearching ? (entry) => matchesEntry(entry, view.query) : undefined}
          sort={comparePlaylistEntries(sort)}
          noMatch={`No tracks match “${view.query.trim()}”`}
          empty={{
            title: isLikes ? 'No liked tracks yet' : 'Nothing in this playlist yet',
            description: isLikes ? 'Tap the heart on any track and it lands here.' : 'Use the menu on any track to add it here.',
            icon: <Illustration name="music" />,
            actions: <Button label="Browse Home" variant="secondary" href="/" />,
          }}
          endMessage={null}
          renderItem={(entry) =>
            isLikes ? (
              // The server drops liked tracks that are gone, so every entry has its track
              entry.track && (
                <TrackRow
                  track={entry.track}
                  showOwner
                  aside={
                    <Text type="supporting" color="secondary">
                      <Timestamp value={toUnixSeconds(entry.addedAt)} format="relative" />
                    </Text>
                  }
                />
              )
            ) : entry.track && !entry.unavailable ? (
              <TrackRow
                track={entry.track}
                showOwner
                excludePlaylistId={playlist.id}
                menuItems={[
                  { type: 'divider' },
                  {
                    label: 'Remove from this playlist',
                    icon: MinusCircleIcon,
                    variant: 'destructive',
                    onClick: () => setRemoving(entry),
                  },
                ]}
              />
            ) : (
              <UnavailableRow entry={entry} onRemove={() => setRemoving(entry)} />
            )
          }
        />
      </TrackListPlayback>
      <AlertDialog
        isOpen={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.name ?? 'this track'}?`}
        description={
          removing?.unavailable
            ? "It's no longer available, so you won't be able to add it back."
            : `It comes out of ${playlist.name}. The track itself isn't affected.`
        }
        actionLabel="Remove"
        onAction={() => {
          if (removing) removeTrack.mutate(removing.trackId)
          setRemoving(null)
        }}
      />
    </VStack>
  )
}
