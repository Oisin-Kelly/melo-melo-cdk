import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Link } from '@astryxdesign/core/Link'
import { Popover } from '@astryxdesign/core/Popover'
import { Slider } from '@astryxdesign/core/Slider'
import { StackItem } from '@astryxdesign/core/Stack'
import { VStack } from '@astryxdesign/core/VStack'
import { QueueListIcon, SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { CoverArt } from '@/components/media/cover-art'
import { tint } from '@/components/media/tint'
import { trackPath } from '@/lib/links'
import { Scrubber, TrackByline, Transport } from './player-controls'
import { QueueList } from './queue-list'
import { useCurrentTrack, usePlayer } from './use-player'
import './player.css'

// Desktop: the player along the bottom of the app, under the nav and the page (it shares
// a full-height column with AppShell, so it never covers content). Shown once something
// has been played. Washed in the playing track's cover colour, mixed into the page's
// own background so it suits light and dark alike.
export function NowPlayingBar() {
  const track = useCurrentTrack()
  if (!track) return null
  return (
    <section className="mm-now-bar" aria-label="Now playing" style={tint(track.imageBgColor)}>
      <HStack gap={3} vAlign="center">
        <CoverArt imageUrl={track.imageUrl} imageBgColor={track.imageBgColor} size="md" />
        {/* fill: lets the title and byline shrink and cut off with "…" rather than run
            into the controls */}
        <StackItem size="fill">
          <VStack gap={0.5}>
            <Link href={trackPath(track)} type="body" color="primary" weight="bold" maxLines={1}>
              {track.name}
            </Link>
            <TrackByline track={track} />
          </VStack>
        </StackItem>
      </HStack>
      <VStack gap={1} hAlign="center">
        <Transport />
        <Scrubber />
      </VStack>
      <HStack gap={2} vAlign="center" hAlign="end">
        <QueueButton />
        <Volume />
      </HStack>
    </section>
  )
}

function QueueButton() {
  // A plain open flag: nothing in the queue links away (a click anywhere else closes it),
  // so it needn't follow the route — which also changes under it when a page swaps an
  // old link for its readable URL
  const [isOpen, setIsOpen] = useState(false)
  return (
    <Popover
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      placement="above"
      alignment="end"
      width={380}
      padding={4}
      label="Queue"
      content={
        <div className="mm-queue-scroll">
          <QueueList />
        </div>
      }
    >
      <IconButton label="Queue" variant="ghost" icon={<Icon icon={QueueListIcon} />} />
    </Popover>
  )
}

function Volume() {
  const player = usePlayer()
  const [volume, setVolume] = useState(100)
  const change = (value: number) => {
    setVolume(value)
    player?.setVolume(value / 100)
  }
  return (
    <HStack gap={2} vAlign="center">
      <Icon icon={volume === 0 ? SpeakerXMarkIcon : SpeakerWaveIcon} color="secondary" />
      <span className="mm-player-slider">
        <Slider label="Volume" isLabelHidden valueDisplay="none" min={0} max={100} value={volume} onChange={change} width="6rem" />
      </span>
    </HStack>
  )
}
