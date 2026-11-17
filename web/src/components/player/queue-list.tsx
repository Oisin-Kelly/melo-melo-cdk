import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { Bars2Icon, XMarkIcon } from '@heroicons/react/24/outline'
import type { CSSProperties, ReactNode } from 'react'
import { CoverArt } from '@/components/media/cover-art'
import type { TrackSummary } from '@/types/api'
import { nameOf } from '@/types/user'
import { ownTouches } from '@/components/lists/own-touches'
import { currentTrack, upcoming } from './queue'
import { useDragReorder } from '@/components/lists/use-drag-reorder'
import { usePlayer, usePlayerState } from './use-player'

/** Keys that follow a track as it moves (an index would hand a dragged row's focus to its
 *  neighbour); the same track queued twice gets #1, #2. */
function stableKeys(tracks: TrackSummary[]) {
  const seen = new Map<string, number>()
  return tracks.map((track) => {
    const n = (seen.get(track.id) ?? 0) + 1
    seen.set(track.id, n)
    return `${track.id}#${n}`
  })
}

type RowProps = {
  track: TrackSummary
  /** Play it now; absent for the track already playing. */
  onPlay?: () => void
  end?: ReactNode
  rowRef?: (el: HTMLElement | null) => void
  style?: CSSProperties
  isDragging?: boolean
}

// One track in the queue: tap it to play it now (an invisible button over the row, like
// the app's track rows); its remove and drag-handle buttons sit above that.
function QueueRow({ track, onPlay, end, rowRef, style, isDragging }: RowProps) {
  return (
    <div className="mm-queue-row" ref={rowRef} style={style} data-dragging={isDragging || undefined}>
      {onPlay && <button type="button" className="mm-queue-play" aria-label={`Play ${track.name}`} onClick={onPlay} />}
      <HStack gap={3} vAlign="center" className="mm-queue-line">
        <CoverArt imageUrl={track.imageUrl} imageBgColor={track.imageBgColor} size="sm" />
        <StackItem size="fill" className="mm-queue-text">
          <VStack gap={0.5}>
            <Text type="body" weight="semibold" maxLines={1}>
              {track.name}
            </Text>
            <Text type="supporting" color="secondary" maxLines={1}>
              {nameOf(track.owner)}
            </Text>
          </VStack>
        </StackItem>
        {end && <span className="mm-queue-end">{end}</span>}
      </HStack>
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <VStack gap={2}>
      <Text type="label" size="sm" weight="semibold" color="secondary" maxLines={1}>
        {title.toUpperCase()}
      </Text>
      <VStack gap={1}>{children}</VStack>
    </VStack>
  )
}

function DragHandle({ name, ...props }: { name: string } & ReturnType<ReturnType<typeof useDragReorder>['handleProps']>) {
  return (
    <button type="button" className="mm-queue-handle" ref={ownTouches} aria-label={`Move ${name} (or use the arrow keys)`} {...props}>
      <Icon icon={Bars2Icon} color="secondary" />
    </button>
  )
}

/** A reorderable run of rows: your queue, or the rest of what's playing. */
function SortableRows({
  tracks,
  section,
  renderEnd,
}: {
  tracks: TrackSummary[]
  section: 'upNext' | 'context'
  renderEnd?: (index: number, track: TrackSummary) => ReactNode
}) {
  const player = usePlayer()
  const drag = useDragReorder((from, to) => player?.move(section, from, to))
  const keys = stableKeys(tracks)
  return tracks.map((track, index) => (
    <QueueRow
      key={keys[index]}
      track={track}
      onPlay={() => player?.jumpTo(section, index)}
      rowRef={drag.rowRef(index)}
      style={drag.rowStyle(index)}
      isDragging={drag.isDragging(index)}
      end={
        <>
          {renderEnd?.(index, track)}
          <DragHandle name={track.name} {...drag.handleProps(index, tracks.length)} />
        </>
      }
    />
  ))
}

/** What's playing and what's coming: your own queue, then the rest of what's playing.
 *  Tap a track to play it now; drag the handle (or arrow keys on it) to move it. */
export function QueueList() {
  const player = usePlayer()
  const { queue } = usePlayerState()
  const playing = currentTrack(queue)
  const { replay, upNext, fromContext } = upcoming(queue)
  const contextName = queue.context?.type === 'TRACK' ? null : queue.context?.name

  return (
    <VStack gap={5}>
      {playing && (
        <Group title="Now playing">
          <QueueRow track={playing} />
        </Group>
      )}
      {upNext.length > 0 && (
        <Group title="Next in queue">
          <SortableRows
            tracks={upNext}
            section="upNext"
            renderEnd={(index, track) => (
              <IconButton
                label={`Remove ${track.name} from the queue`}
                variant="ghost"
                size="sm"
                icon={<Icon icon={XMarkIcon} color="secondary" />}
                onClick={() => player?.removeFromQueue(index)}
              />
            )}
          />
        </Group>
      )}
      {replay.length + fromContext.length > 0 && (
        <Group title={contextName ? `Next from ${contextName}` : 'Next'}>
          {/* Stepped back past (Next replays them): playable, but not part of the order to drag */}
          {replay.map((track, index) => (
            <QueueRow key={`replay:${track.id}:${index}`} track={track} onPlay={() => player?.jumpTo('replay', index)} />
          ))}
          <SortableRows tracks={fromContext} section="context" />
        </Group>
      )}
      {upNext.length + replay.length + fromContext.length === 0 && (
        <Text type="supporting" color="secondary">
          Nothing else is queued. Use ⋯ → Play next or Add to queue on any track.
        </Text>
      )}
    </VStack>
  )
}
