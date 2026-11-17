import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import { Bars2Icon, MagnifyingGlassIcon, MusicalNoteIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useState, type MouseEvent } from 'react'
import { PageLoader } from '@/components/feedback/page-loader'
import { Illustration } from '@/components/illustrations/illustration'
import { ownTouches } from '@/components/lists/own-touches'
import { useDragReorder } from '@/components/lists/use-drag-reorder'
import { CoverArt } from '@/components/media/cover-art'
import { LIMITS } from '@/config/limits'
import type { TrackSummary } from '@/types/api'
import { formatDuration, formatLength } from '@/utils/format'
import { useAllMyTracks } from '@/lib/my-tracks'
import type { TracklistDraft } from './use-tracklist-draft'
import './album-editor.css'

/** The album's tracks in order: drag a row by its handle (or arrow keys on it) to move
 *  it, ✕ to take it out, Add tracks to open the picker. */
export function Tracklist({ draft, sharedWith = 0 }: { draft: TracklistDraft; sharedWith?: number }) {
  const { tracks } = draft
  const drag = useDragReorder(draft.move)
  const seconds = tracks.reduce((total, track) => total + track.duration, 0)
  const isFull = tracks.length >= LIMITS.albumTracks

  return (
    <VStack gap={3}>
      <HStack gap={2} vAlign="center">
        <StackItem size="fill">
          <VStack gap={0.5}>
            <Text type="label" size="sm" weight="semibold" color="secondary">
              TRACKS
            </Text>
            <Text type="supporting" color="secondary">
              {tracks.length === 0
                ? 'No tracks yet'
                : `${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}${seconds > 0 ? ` · ${formatLength(seconds)}` : ''}`}
              {isFull && ` · Albums hold up to ${LIMITS.albumTracks}`}
            </Text>
          </VStack>
        </StackItem>
        <Button label="Add tracks" variant="secondary" size="sm" icon={<Icon icon={PlusIcon} />} onClick={draft.startPicking} />
      </HStack>
      {sharedWith > 0 && (
        <Banner
          status="info"
          title={`Shared with ${sharedWith === 1 ? '1 person' : `${sharedWith} people`}`}
          description="Tracks you add reach them when you save; tracks you remove, they lose (unless you've shared them directly)."
        />
      )}
      {tracks.length === 0 && (
        <button type="button" className="mm-edit-empty" onClick={draft.startPicking}>
          <Icon icon={MusicalNoteIcon} color="secondary" />
          <Text type="body" weight="semibold">
            Pick from your uploads
          </Text>
          <Text type="supporting" color="secondary">
            Drag them into order afterwards. You can also add tracks later.
          </Text>
        </button>
      )}
      <ol className="mm-edit-list">
        {tracks.map((track, index) => (
          <li
            key={track.id}
            className="mm-edit-row"
            ref={drag.rowRef(index)}
            style={drag.rowStyle(index)}
            data-dragging={drag.isDragging(index) || undefined}
          >
            <button
              type="button"
              className="mm-edit-handle"
              ref={ownTouches}
              aria-label={`Move ${track.name} (or use the arrow keys)`}
              {...drag.handleProps(index, tracks.length)}
            >
              <Icon icon={Bars2Icon} color="secondary" />
            </button>
            <span className="mm-edit-number" aria-hidden="true">
              {index + 1}
            </span>
            <CoverArt imageUrl={track.imageUrl} imageBgColor={track.imageBgColor} size="sm" />
            <span className="mm-edit-name">
              <Text type="body" weight="semibold" maxLines={1}>
                {track.name}
              </Text>
            </span>
            <Text type="supporting" color="secondary">
              {formatDuration(track.duration)}
            </Text>
            <IconButton
              label={`Remove ${track.name}`}
              variant="ghost"
              size="sm"
              icon={<Icon icon={XMarkIcon} />}
              onClick={() => draft.remove(track.id)}
            />
          </li>
        ))}
      </ol>
    </VStack>
  )
}

/** "Add tracks": everything you've uploaded, with a search box; the album's own tracks
 *  start ticked. Nothing changes until Done. */
export function TrackPicker({ draft }: { draft: TracklistDraft }) {
  const mine = useAllMyTracks()
  const [search, setSearch] = useState('')
  const picked = draft.picked ?? new Map<string, TrackSummary>()
  const isFull = picked.size >= LIMITS.albumTracks

  if (mine.isPending) return <PageLoader compact what="tracks" />
  if (mine.isError)
    return (
      <EmptyState
        isCompact
        icon={<Illustration name="lost" size="sm" />}
        title="Couldn't load your tracks"
        description="Check your connection and try again."
        actions={<Button label="Try again" onClick={() => void mine.refetch()} />}
      />
    )
  if (mine.data.length === 0)
    return (
      <EmptyState
        isCompact
        icon={<Illustration name="music" size="sm" />}
        title="Upload a track first"
        description="Albums are made of tracks you've uploaded. Once you have some, they show up here."
      />
    )

  const words = search.trim().toLowerCase()
  const matches = words ? mine.data.filter((track) => track.name.toLowerCase().includes(words)) : mine.data
  // A row tap ticks it too; the checkbox itself already has
  const onRowClick = (track: TrackSummary) => (event: MouseEvent<HTMLElement>) => {
    if (!(event.target as HTMLElement).closest('input, label')) draft.toggle(track)
  }

  return (
    <VStack gap={3}>
      <TextInput
        label="Search your tracks"
        isLabelHidden
        placeholder="Search your tracks"
        startIcon={MagnifyingGlassIcon}
        value={search}
        onChange={setSearch}
        hasClear
      />
      <Text type="supporting" color="secondary" role="status">
        {picked.size} of {LIMITS.albumTracks} picked{isFull && ' — untick one to pick another'}
      </Text>
      {matches.length === 0 ? (
        <Text type="body" color="secondary">
          No tracks match "{search.trim()}"
        </Text>
      ) : (
        <ul className="mm-edit-list">
          {matches.map((track) => {
            const isPicked = picked.has(track.id)
            const isOff = isFull && !isPicked
            return (
              <li
                key={track.id}
                className="mm-edit-row mm-pick-row"
                data-disabled={isOff || undefined}
                onClick={isOff ? undefined : onRowClick(track)}
              >
                <CheckboxInput
                  label={track.name}
                  isLabelHidden
                  value={isPicked}
                  isDisabled={isOff}
                  onChange={() => draft.toggle(track)}
                />
                <CoverArt imageUrl={track.imageUrl} imageBgColor={track.imageBgColor} size="sm" />
                <span className="mm-edit-name">
                  <Text type="body" weight="semibold" maxLines={1}>
                    {track.name}
                  </Text>
                </span>
                <Text type="supporting" color="secondary">
                  {formatDuration(track.duration)}
                </Text>
              </li>
            )
          })}
        </ul>
      )}
    </VStack>
  )
}
