import { Icon } from '@astryxdesign/core/Icon'
import { PauseIcon, PlayIcon } from '@heroicons/react/24/solid'
import type { ReactNode } from 'react'
import { usePlayLoaded } from '@/components/player/use-player'
import type { ContextLoader } from '@/components/player/player'
import type { PlayContext } from '@/components/player/queue'
import './media.css'

/** A cover that plays its album or playlist from a button over it: shown while hovering
 *  the tile or row it's in (`mm-play-hover` on that), and always while it's the one
 *  playing. The tile or row itself still opens the page; on touch screens there's no
 *  hover, so a tap just opens it. */
export function CoverPlay({
  context,
  load,
  name,
  isEmpty = false,
  children,
}: {
  context: { type: PlayContext['type']; id: string }
  load: ContextLoader
  name: string
  /** Nothing in it to play: no button. */
  isEmpty?: boolean
  children: ReactNode
}) {
  const play = usePlayLoaded(context, load)
  return (
    <span className="mm-cover-play-wrap">
      {children}
      {play.onPlay && !isEmpty && (
        <button
          type="button"
          className="mm-cover-play"
          data-playing={play.isPlaying || undefined}
          aria-label={play.isPlaying ? `Pause ${name}` : `Play ${name}`}
          onClick={(event) => {
            // The tile or row around it is a link
            event.preventDefault()
            event.stopPropagation()
            play.onPlay?.()
          }}
        >
          <Icon icon={play.isPlaying ? PauseIcon : PlayIcon} />
        </button>
      )}
    </span>
  )
}
