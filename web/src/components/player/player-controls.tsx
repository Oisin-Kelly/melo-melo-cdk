import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Link } from '@astryxdesign/core/Link'
import { Slider } from '@astryxdesign/core/Slider'
import { StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { ArrowPathRoundedSquareIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/outline'
import { BackwardIcon, ForwardIcon, PauseIcon, PlayIcon } from '@heroicons/react/24/solid'
import { useState } from 'react'
import { profilePath } from '@/lib/links'
import type { TrackSummary } from '@/types/api'
import { nameOf } from '@/types/user'
import { formatDuration } from '@/utils/format'
import { ownTouches } from '@/components/lists/own-touches'
import { useCurrentTrack, usePlaybackPosition, usePlayer, usePlayerState, usePlayingFrom } from './use-player'

// The pieces the desktop bar and the phone's Now playing sheet are made of.

/** The line under the title: who made it, then what it's playing from ("Bob · Late Shift").
 *  `isLinked` off where the whole bar is one tap target (the phone mini bar). */
export function TrackByline({ track, isLinked = true }: { track: TrackSummary; isLinked?: boolean }) {
  const from = usePlayingFrom()
  const owner = nameOf(track.owner)
  return (
    <Text type="supporting" color="secondary" maxLines={1}>
      {isLinked ? (
        <Link href={profilePath(track.owner.username)} color="secondary" className="mm-inline-link">
          {owner}
        </Link>
      ) : (
        owner
      )}
      {from && (
        <>
          {' · '}
          {isLinked ? (
            <Link href={from.href} color="secondary" className="mm-inline-link">
              {from.name}
            </Link>
          ) : (
            from.name
          )}
        </>
      )}
    </Text>
  )
}

type Size = 'sm' | 'md' | 'lg'

/** Play/pause on its own: the mini bar's (ghost), and the middle of the transport (a solid
 *  circle, `isHero` making it the big one in Now playing). */
export function PlayPauseButton({
  size,
  variant = 'primary',
  isHero = false,
}: {
  size?: Size
  variant?: 'primary' | 'ghost'
  isHero?: boolean
}) {
  const player = usePlayer()
  const { status } = usePlayerState()
  const isPlaying = status.status === 'playing' || status.status === 'loading'
  const classes = [variant === 'primary' && 'mm-play', isHero && 'mm-play-hero'].filter(Boolean).join(' ')
  return (
    <IconButton
      className={classes || undefined}
      label={isPlaying ? 'Pause' : 'Play'}
      variant={variant}
      size={size}
      // Spinner while the file is on its way, or playing has caught up with the download
      isLoading={status.status === 'loading' || (status.status === 'playing' && status.isBuffering)}
      // The big button's icon is sized on its own class: a rule on every svg inside the
      // button would stretch the loading spinner's too, pushing it off centre
      icon={<Icon icon={isPlaying ? PauseIcon : PlayIcon} className={isHero ? 'mm-play-hero-icon' : undefined} />}
      onClick={() => player?.toggle()}
    />
  )
}

export function NextButton({ size }: { size?: Size }) {
  const player = usePlayer()
  return (
    <IconButton label="Next" variant="ghost" size={size} icon={<Icon icon={ForwardIcon} />} onClick={() => player?.next()} />
  )
}

function PreviousButton({ size }: { size?: Size }) {
  const player = usePlayer()
  return (
    <IconButton
      label="Previous"
      variant="ghost"
      size={size}
      icon={<Icon icon={BackwardIcon} />}
      onClick={() => player?.back()}
    />
  )
}

/** Shuffle: lit (accent, with a dot under it) while on. */
function ShuffleButton({ size }: { size?: Size }) {
  const player = usePlayer()
  const { isShuffled } = usePlayerState().queue
  return (
    <IconButton
      className="mm-mode"
      data-on={isShuffled || undefined}
      aria-pressed={isShuffled}
      label={isShuffled ? 'Turn shuffle off' : 'Shuffle'}
      variant="ghost"
      size={size}
      icon={<Icon icon={ArrowsRightLeftIcon} />}
      onClick={() => player?.toggleShuffle()}
    />
  )
}

const REPEAT_LABELS = { off: 'Repeat', all: 'Repeat one', one: 'Turn repeat off' } as const

/** Repeat, cycling off → all → one: lit while on, with a "1" for repeat one. */
function RepeatButton({ size }: { size?: Size }) {
  const player = usePlayer()
  const { repeat } = usePlayerState().queue
  return (
    <span className="mm-repeat" data-one={repeat === 'one' || undefined}>
      <IconButton
        className="mm-mode"
        data-on={repeat !== 'off' || undefined}
        label={REPEAT_LABELS[repeat]}
        variant="ghost"
        size={size}
        icon={<Icon icon={ArrowPathRoundedSquareIcon} />}
        onClick={() => player?.cycleRepeat()}
      />
    </span>
  )
}

/** Shuffle, back, play/pause, next, repeat. `isSpread`: across the full width, the play
 *  button big in the middle (Now playing on a phone); otherwise a tight centred group. */
export function Transport({ isSpread = false }: { isSpread?: boolean }) {
  if (isSpread)
    return (
      <HStack vAlign="center" hAlign="between" width="100%">
        <ShuffleButton size="lg" />
        <PreviousButton size="lg" />
        <PlayPauseButton size="lg" isHero />
        <NextButton size="lg" />
        <RepeatButton size="lg" />
      </HStack>
    )
  return (
    <HStack gap={3} vAlign="center" hAlign="center">
      <ShuffleButton size="sm" />
      <PreviousButton />
      <PlayPauseButton />
      <NextButton />
      <RepeatButton size="sm" />
    </HStack>
  )
}

/** The scrubber (in the text colour, like the iOS player) with the time played and the
 *  track's length. While dragging, the times follow the thumb and the seek happens on
 *  release. `layout`: the times either side (desktop) or under it (Now playing). */
export function Scrubber({ layout = 'beside' }: { layout?: 'beside' | 'below' }) {
  const player = usePlayer()
  const track = useCurrentTrack()
  const { status } = usePlayerState()
  const position = usePlaybackPosition()
  const [dragging, setDragging] = useState<number | null>(null)
  // The file's own length once its index has loaded; the track's until then
  const duration = status.duration || track?.duration || 0
  const value = Math.min(dragging ?? position, duration)
  const played = (
    <Text type="supporting" color="secondary" className="mm-player-time">
      {formatDuration(value)}
    </Text>
  )
  const length = (
    <Text type="supporting" color="secondary" className="mm-player-time" data-end>
      {/* The length the rest of the app shows (whole seconds from the server), not the
          file's fractional one, so 0:44 on the page isn't 0:45 here */}
      {formatDuration(track?.duration || duration)}
    </Text>
  )
  const slider = (
    <span className="mm-player-slider" ref={ownTouches}>
      <Slider
        label="Seek"
        isLabelHidden
        valueDisplay="none"
        min={0}
        max={Math.max(duration, 1)}
        value={value}
        formatValue={formatDuration}
        isDisabled={!track || duration === 0}
        onChange={(seconds: number) => setDragging(seconds)}
        onChangeEnd={(seconds: number) => {
          player?.seek(seconds)
          setDragging(null)
        }}
      />
    </span>
  )
  if (layout === 'below')
    return (
      <VStack gap={1} width="100%">
        {slider}
        <HStack hAlign="between">
          {played}
          {length}
        </HStack>
      </VStack>
    )
  return (
    <HStack gap={3} vAlign="center" width="100%">
      {played}
      <StackItem size="fill">{slider}</StackItem>
      {length}
    </HStack>
  )
}
