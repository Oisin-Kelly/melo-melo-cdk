import type { ReactNode } from 'react'
import type { TrackSource } from './player'
import { TrackListContext } from './player-context'
import type { PlayContext } from './queue'

/** Wrap a page's track rows: a tapped row plays `tracks` (e.g. every page of the album, in
 *  the order shown) as `context`, starting from that row. */
export function TrackListPlayback({
  context,
  tracks,
  children,
}: {
  context: PlayContext | null
  tracks: TrackSource
  children: ReactNode
}) {
  if (!context) return children
  return <TrackListContext.Provider value={{ context, tracks }}>{children}</TrackListContext.Provider>
}
