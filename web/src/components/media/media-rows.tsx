import { Button } from '@astryxdesign/core/Button'
import { DropdownMenu, type DropdownMenuOption } from '@astryxdesign/core/DropdownMenu'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { StackItem } from '@astryxdesign/core/Stack'
import { VStack } from '@astryxdesign/core/VStack'
import {
  EllipsisHorizontalIcon,
  ForwardIcon,
  HeartIcon as HeartOutline,
  MusicalNoteIcon,
  UserIcon,
  PlusCircleIcon,
  QueueListIcon,
} from '@heroicons/react/24/outline'
import { HeartIcon as HeartSolid, PauseIcon, PlayIcon } from '@heroicons/react/24/solid'
import type { ReactNode } from 'react'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { useToggleLike } from '@/lib/likes'
import { albumPath, profilePath, trackPath } from '@/lib/links'
import { useAddToPlaylist, usePlaylists } from '@/lib/playlists'
import type { AlbumSummary, TrackSummary } from '@/types/api'
import { nameOf } from '@/types/user'
import { formatDuration, formatLength } from '@/utils/format'
import { loadAlbum } from '@/components/player/load-context'
import { usePlayLoaded, useQueueActions, useTrackRowPlay } from '@/components/player/use-player'
import { useIsCompactDensity } from '@/components/theme/use-display-prefs'
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
  /** Without a handler (not playable from here yet) the button is disabled with a tooltip. */
  onPlay?: () => void
  /** This is what's playing: the button pauses it. */
  isPlaying?: boolean
  /** Round and extra large (a compact page header's), instead of `size`. */
  isBig?: boolean
}

// The play button (black in light mode, white in dark): round and icon-only in rows, a
// pill with its text in page headers.
export function PlayButton({ label, text, size, onPlay, isPlaying = false, isBig = false }: PlayButtonProps) {
  const shared = {
    className: isBig ? 'mm-play mm-play-big' : 'mm-play',
    size: isBig ? ('lg' as const) : size,
    variant: 'primary' as const,
    isDisabled: !onPlay,
    tooltip: onPlay ? undefined : 'Playback coming soon',
    onClick: onPlay,
    icon: <Icon icon={isPlaying ? PauseIcon : PlayIcon} />,
  }
  return text ? (
    <Button {...shared} label={isPlaying ? 'Pause' : text} />
  ) : (
    <IconButton {...shared} label={isPlaying ? 'Pause' : label} />
  )
}

/** The filled heart of something you've liked, in the theme's strong red (`--color-icon-red`) —
 *  every liked heart in the app is this one. */
export function LikedHeart({ size, label }: { size?: 'xsm' | 'sm' | 'md'; label?: string }) {
  return <Icon icon={HeartSolid} size={size} color="inherit" className="mm-liked-heart" label={label} />
}

type LikeProps = { kind: 'TRACK' | 'ALBUM'; id: string; liked: boolean; name: string }

export function LikeButton({ kind, id, liked, name }: LikeProps) {
  const toggle = useToggleLike()
  return (
    <IconButton
      label={liked ? `Unlike ${name}` : `Like ${name}`}
      tooltip={liked ? 'Unlike' : 'Like'}
      variant="ghost"
      icon={liked ? <LikedHeart /> : <Icon icon={HeartOutline} color="secondary" />}
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
  isCurrent = false,
  children,
}: {
  colour: string | null
  variant?: RowVariant
  /** The track playing now (marked for styling). */
  isCurrent?: boolean
  children: ReactNode
}) {
  // Compact density (Settings → Appearance): one step less padding
  const isCompact = useIsCompactDensity()
  const padding = variant === 'card' ? (isCompact ? 2 : 3) : isCompact ? 1 : 2
  return (
    <div
      className="mm-row"
      data-variant={variant}
      data-current={isCurrent || undefined}
      style={variant === 'card' ? tint(colour) : undefined}
    >
      <HStack gap={3} vAlign="center" padding={padding}>
        {children}
      </HStack>
    </div>
  )
}

/** The "…" menu on a track row: play next / add to queue, add to one of your playlists,
 *  plus the screen's own items. */
export function TrackMenu({
  track,
  excludePlaylistId,
  extraItems = [],
  hasLikeItem = false,
  hasGoToItems = false,
}: {
  track: TrackSummary
  /** The playlist being viewed, which it's already in. */
  excludePlaylistId?: string
  extraItems?: DropdownMenuOption[]
  /** Like / Unlike as the first item — for phone rows, which have no heart button. */
  hasLikeItem?: boolean
  /** Go to track / Go to artist first — on rows (on phones tapping a row plays it rather
   *  than opening it), not on the track's own page. */
  hasGoToItems?: boolean
}) {
  const playlists = usePlaylists()
  const add = useAddToPlaylist()
  const toggleLike = useToggleLike()
  const queue = useQueueActions()

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
        ...(hasGoToItems
          ? [
              { label: 'Go to track', icon: MusicalNoteIcon, href: trackPath(track) },
              { label: 'Go to artist', icon: UserIcon, href: profilePath(track.owner.username) },
            ]
          : []),
        ...(hasLikeItem
          ? [
              {
                label: track.likedByMe ? 'Unlike' : 'Like',
                icon: track.likedByMe ? HeartSolid : HeartOutline,
                onClick: () => toggleLike.mutate({ kind: 'TRACK', id: track.id, liked: !track.likedByMe }),
              },
            ]
          : []),
        ...(queue
          ? [
              { label: 'Play next', icon: ForwardIcon, onClick: () => queue.playNext([track]) },
              { label: 'Add to queue', icon: QueueListIcon, onClick: () => queue.addToQueue([track]) },
            ]
          : []),
        { label: 'Add to playlist', icon: PlusCircleIcon, items: playlistItems },
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
  /** Its place in the list (album and playlist pages): shown before the cover. */
  number?: number
  /** Show who made it; off where the context already says (the feed's sender line, an album page). */
  showOwner?: boolean
  /** Extra detail, e.g. when it was liked: before the actions on wider screens, at the end
   *  of the second line on phones (where it would squeeze the title). */
  aside?: ReactNode
  /** card: Home's feed look, with its own play button; flat rows play from the row itself
   *  and keep the rest in ⋯ */
  variant?: RowVariant
}

/** A row's place in its list, before the cover: the tracklist's "#" column. */
export function RowNumber({ number }: { number: number }) {
  return (
    <span className="mm-row-number">
      <Text type="supporting" color="secondary" hasTabularNumbers>
        {number}
      </Text>
    </span>
  )
}

/** The column names over a numbered tracklist (wider screens only — phone rows fold the
 *  extra detail into their second line): # · Title · the rows' `aside`, if they have one. */
export function TrackListHeader({ aside }: { aside?: string }) {
  const isMobile = useIsMobile()
  if (isMobile) return null
  const label = (text: string) => (
    <Text type="label" size="sm" weight="semibold" color="secondary">
      {text.toUpperCase()}
    </Text>
  )
  return (
    <div className="mm-tracklist-head">
      <span className="mm-row-number">{label('#')}</span>
      <span className="mm-tracklist-head-title">{label('Title')}</span>
      {aside && <span className="mm-row-aside">{label(aside)}</span>}
      <span className="mm-tracklist-head-end" />
    </div>
  )
}

/** A few bars bouncing over the playing track's cover (still while paused) — or, `isInline`,
 *  standing in the row's number column in a numbered tracklist. */
function Equaliser({ isPlaying, isInline = false }: { isPlaying: boolean; isInline?: boolean }) {
  return (
    <span
      className={isInline ? 'mm-equaliser mm-equaliser-inline' : 'mm-equaliser'}
      data-playing={isPlaying || undefined}
      aria-hidden
    >
      <span />
      <span />
      <span />
    </span>
  )
}

export function TrackRow({
  track,
  number,
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
  const play = useTrackRowPlay(track)
  // A flat row plays when tapped (its list from here, see TrackListPlayback); its title
  // still opens the track on wider screens, and ⋯ → Go to track on phones, where the title
  // is most of the row. Without a player (tests of other screens) the row opens the track.
  const isRowPlay = variant === 'flat' && Boolean(play.onPlay)
  // The track playing now: its title in the accent colour
  const titleColour = play.isCurrent ? 'accent' : 'primary'
  const title = isRowPlay && isMobile ? (
    <Text type="body" color={titleColour} weight="bold" maxLines={1}>
      {track.name}
    </Text>
  ) : (
    <Link
      href={trackPath(track)}
      type="body"
      color={titleColour}
      weight="bold"
      maxLines={1}
      className={isRowPlay ? undefined : 'mm-row-link'}
    >
      {track.name}
    </Link>
  )
  return (
    <MediaRow colour={track.imageBgColor} variant={variant} isCurrent={play.isCurrent}>
      {isRowPlay && (
        <button
          type="button"
          className="mm-row-play"
          aria-label={play.isPlaying ? `Pause ${track.name}` : `Play ${track.name}`}
          onClick={play.onPlay}
        />
      )}
      {/* A numbered row: its number — the bars while it's the one playing — and, on hover
          (desktop), what a click does in their place: play, or pause on the playing row */}
      {number !== undefined && (
        <span className="mm-row-number">
          <span className="mm-row-number-rest">
            {play.isCurrent ? (
              <Equaliser isPlaying={play.isPlaying} isInline />
            ) : (
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {number}
              </Text>
            )}
          </span>
          {isRowPlay && (
            <span className="mm-row-number-play" aria-hidden>
              <Icon icon={play.isPlaying ? PauseIcon : PlayIcon} size="sm" />
            </span>
          )}
        </span>
      )}
      <span className="mm-row-cover">
        <CoverArt imageUrl={track.imageUrl} imageBgColor={track.imageBgColor} size="sm" />
        {play.isCurrent && number === undefined && <Equaliser isPlaying={play.isPlaying} />}
        {/* Desktop: hovering the row shows what a click does, over the cover (a numbered
            row shows it in the number's place instead) */}
        {isRowPlay && number === undefined && (
          <span className="mm-row-hover-play" aria-hidden>
            <Icon icon={play.isPlaying ? PauseIcon : PlayIcon} />
          </span>
        )}
      </span>
      <StackItem size="fill">
        <VStack gap={0.5}>
          {title}
          <Text type="supporting" color="secondary" maxLines={1}>
            {/* Phones: liked shows here, first, since the heart button is in ⋯ */}
            {isMobile && track.likedByMe && (
              <>
                <span className="mm-inline-icon">
                  <LikedHeart size="xsm" label="Liked" />
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
      {/* A column of its own on wider screens, every row's the same width */}
      {!isMobile && aside && <span className="mm-row-aside">{aside}</span>}
      {/* Phones: the heart moves into ⋯ (the row is too narrow for the title otherwise) */}
      {!isMobile && <LikeButton kind="TRACK" id={track.id} liked={track.likedByMe} name={track.name} />}
      <TrackMenu
        track={track}
        excludePlaylistId={excludePlaylistId}
        extraItems={menuItems}
        hasLikeItem={isMobile}
        hasGoToItems
      />
      {variant === 'card' && (
        <PlayButton label={`Play ${track.name}`} size="lg" onPlay={play.onPlay} isPlaying={play.isPlaying} />
      )}
    </MediaRow>
  )
}

export function AlbumRow({ album, showOwner, aside, variant = 'flat' }: RowProps & { album: AlbumSummary }) {
  const isMobile = useIsMobile()
  // Home's album cards play the whole album, loaded after the tap
  const play = usePlayLoaded({ type: 'ALBUM', id: album.id }, () => loadAlbum(album.id))
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
      {variant === 'card' && (
        <PlayButton label={`Play ${album.name}`} size="lg" onPlay={play.onPlay} isPlaying={play.isPlaying} />
      )}
    </MediaRow>
  )
}
