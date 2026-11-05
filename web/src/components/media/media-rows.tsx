import { Button } from '@astryxdesign/core/Button'
import { DropdownMenu, type DropdownMenuOption } from '@astryxdesign/core/DropdownMenu'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { StackItem } from '@astryxdesign/core/Stack'
import { VStack } from '@astryxdesign/core/VStack'
import { EllipsisHorizontalIcon, HeartIcon as HeartOutline } from '@heroicons/react/24/outline'
import { HeartIcon as HeartSolid, PlayIcon } from '@heroicons/react/24/solid'
import type { ReactNode } from 'react'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { useToggleLike } from '@/lib/likes'
import { albumPath, profilePath, trackPath } from '@/lib/links'
import { useAddToPlaylist, usePlaylists } from '@/lib/playlists'
import type { AlbumSummary, TrackSummary } from '@/types/api'
import { nameOf } from '@/types/user'
import { formatDuration, formatLength } from '@/utils/format'
import { CoverArt } from './cover-art'
import { tint } from './tint'
import './media.css'

// Track and album rows shared by every list that shows them (Home, Liked, album and
// playlist pages). Liking goes through the one shared mutation (lib/likes), which
// updates every cached copy, so rows need no callbacks for it.

type PlayButtonProps = {
  label: string
  /** Shown on the button ("Play all"): a pill instead of the round icon-only button. */
  text?: string
  size?: 'sm' | 'md' | 'lg'
  /** Playback isn't wired yet: without a handler the button is disabled with a tooltip. */
  onPlay?: () => void
}

// The play button (black in light mode, white in dark): round and icon-only in rows, a
// pill with its text in page headers.
export function PlayButton({ label, text, size, onPlay }: PlayButtonProps) {
  const shared = {
    className: 'mm-play',
    size,
    variant: 'primary' as const,
    isDisabled: !onPlay,
    tooltip: onPlay ? undefined : 'Playback coming soon',
    onClick: onPlay,
    icon: <Icon icon={PlayIcon} />,
  }
  return text ? <Button {...shared} label={text} /> : <IconButton {...shared} label={label} />
}

type LikeProps = { kind: 'TRACK' | 'ALBUM'; id: string; liked: boolean; name: string }

export function LikeButton({ kind, id, liked, name }: LikeProps) {
  const toggle = useToggleLike()
  return (
    <IconButton
      label={liked ? `Unlike ${name}` : `Like ${name}`}
      tooltip={liked ? 'Unlike' : 'Like'}
      variant="ghost"
      icon={<Icon icon={liked ? HeartSolid : HeartOutline} color={liked ? 'error' : 'secondary'} />}
      onClick={() => toggle.mutate({ kind, id, liked: !liked })}
    />
  )
}

export type RowVariant = 'flat' | 'card'

/** One row of a list (.mm-row). Give its title link the mm-row-link class and the whole row
 *  opens it; the row's buttons and other links still work on their own. Two looks:
 *  - flat (default): no outline or fill, a soft background on hover — a tracklist to scan
 *  - card: outlined and washed in its cover's colour — Home's feed, where each row stands
 *    alone under its "shared by" line */
export function MediaRow({
  colour,
  variant = 'flat',
  children,
}: {
  colour: string | null
  variant?: RowVariant
  children: ReactNode
}) {
  return (
    <div className="mm-row" data-variant={variant} style={variant === 'card' ? tint(colour) : undefined}>
      <HStack gap={3} vAlign="center" padding={variant === 'card' ? 3 : 2}>
        {children}
      </HStack>
    </div>
  )
}

/** The "…" menu on a track row: add to one of your playlists, plus the screen's own items. */
export function TrackMenu({
  track,
  excludePlaylistId,
  extraItems = [],
  hasLikeItem = false,
}: {
  track: TrackSummary
  /** The playlist being viewed, which it's already in. */
  excludePlaylistId?: string
  extraItems?: DropdownMenuOption[]
  /** Like / Unlike as the first item — for phone rows, which have no heart button. */
  hasLikeItem?: boolean
}) {
  const playlists = usePlaylists()
  const add = useAddToPlaylist()
  const toggleLike = useToggleLike()

  // The likes playlist only changes through liking
  const targets = (playlists.data ?? []).filter((p) => p.type === 'CUSTOM' && p.id !== excludePlaylistId)
  const playlistItems: DropdownMenuOption[] = playlists.isPending
    ? [{ label: 'Loading…', isDisabled: true }]
    : targets.length === 0
      ? [{ label: 'No other playlists yet', isDisabled: true }]
      : targets.map((playlist) => ({
          id: playlist.id,
          label: playlist.name,
          onClick: () => add.mutate({ playlist, trackId: track.id }),
        }))

  return (
    <DropdownMenu
      alignment="end"
      renderTrigger={(props) => (
        <IconButton
          {...props}
          label={`More options for ${track.name}`}
          variant="ghost"
          icon={<Icon icon={EllipsisHorizontalIcon} color="secondary" />}
        />
      )}
      items={[
        ...(hasLikeItem
          ? [
              {
                label: track.likedByMe ? 'Unlike' : 'Like',
                icon: track.likedByMe ? HeartSolid : HeartOutline,
                onClick: () => toggleLike.mutate({ kind: 'TRACK', id: track.id, liked: !track.likedByMe }),
              },
            ]
          : []),
        { label: 'Add to playlist', items: playlistItems },
        ...extraItems,
      ]}
    />
  )
}

function Owner({ owner }: { owner: TrackSummary['owner'] }) {
  return (
    <Link href={profilePath(owner.username)} color="secondary" className="mm-inline-link">
      {nameOf(owner)}
    </Link>
  )
}

type RowProps = {
  /** Show who made it; off where the context already says (the feed's sender line, an album page). */
  showOwner?: boolean
  /** Extra detail, e.g. when it was liked: before the actions on wider screens, at the end
   *  of the second line on phones (where it would squeeze the title). */
  aside?: ReactNode
  /** card: Home's feed look, with its own play button; flat rows play from the row itself
   *  (once playback exists) and keep the rest in ⋯ */
  variant?: RowVariant
}

export function TrackRow({
  track,
  showOwner,
  aside,
  variant = 'flat',
  menuItems,
  excludePlaylistId,
}: RowProps & {
  track: TrackSummary
  /** The screen's own items for the ⋯ menu, after Add to playlist. */
  menuItems?: DropdownMenuOption[]
  /** The playlist being viewed, left out of Add to playlist. */
  excludePlaylistId?: string
}) {
  const isMobile = useIsMobile()
  return (
    <MediaRow colour={track.imageBgColor} variant={variant}>
      <CoverArt imageUrl={track.imageUrl} imageBgColor={track.imageBgColor} size="sm" />
      <StackItem size="fill">
        <VStack gap={0.5}>
          <Link href={trackPath(track)} type="body" color="primary" weight="bold" maxLines={1} className="mm-row-link">
            {track.name}
          </Link>
          <Text type="supporting" color="secondary" maxLines={1}>
            {/* Phones: liked shows here, first, since the heart button is in ⋯ */}
            {isMobile && track.likedByMe && (
              <>
                <span className="mm-inline-icon">
                  <Icon icon={HeartSolid} size="xsm" color="error" aria-label="Liked" />
                </span>{' '}
              </>
            )}
            {showOwner && (
              <>
                <Owner owner={track.owner} /> ·{' '}
              </>
            )}
            {formatDuration(track.duration)}
            {isMobile && aside && <> · {aside}</>}

          </Text>
        </VStack>
      </StackItem>
      {!isMobile && aside}
      {/* Phones: the heart moves into ⋯ (the row is too narrow for the title otherwise) */}
      {!isMobile && <LikeButton kind="TRACK" id={track.id} liked={track.likedByMe} name={track.name} />}
      <TrackMenu track={track} excludePlaylistId={excludePlaylistId} extraItems={menuItems} hasLikeItem={isMobile} />
      {variant === 'card' && <PlayButton label={`Play ${track.name}`} size="lg" />}
    </MediaRow>
  )
}

export function AlbumRow({ album, showOwner, aside, variant = 'flat' }: RowProps & { album: AlbumSummary }) {
  const isMobile = useIsMobile()
  return (
    <MediaRow colour={album.imageBgColor} variant={variant}>
      <CoverArt imageUrl={album.imageUrl} imageBgColor={album.imageBgColor} size="sm" />
      <StackItem size="fill">
        <VStack gap={0.5}>
          <Link href={albumPath(album)} type="body" color="primary" weight="bold" maxLines={1} className="mm-row-link">
            {album.name}
          </Link>
          <Text type="supporting" color="secondary" maxLines={1}>
            {showOwner ? <Owner owner={album.owner} /> : 'Album'} · {album.trackCount}{' '}
            {album.trackCount === 1 ? 'track' : 'tracks'}
            {album.totalDurationSeconds > 0 && ` · ${formatLength(album.totalDurationSeconds)}`}
            {isMobile && aside && <> · {aside}</>}
          </Text>
        </VStack>
      </StackItem>
      {!isMobile && aside}
      <LikeButton kind="ALBUM" id={album.id} liked={album.likedByMe} name={album.name} />
      {variant === 'card' && <PlayButton label={`Play ${album.name}`} size="lg" />}
    </MediaRow>
  )
}
