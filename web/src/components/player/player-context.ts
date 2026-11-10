import { createContext } from 'react'
import type { Player, TrackSource } from './player'
import type { PlayContext } from './queue'

/** The one Player (null outside the signed-in app, where nothing plays). */
export const PlayerContext = createContext<Player | null>(null)

/** The list a track row sits in: tapping a row plays this list from that row. Rows
 *  outside one play just their own track. */
export const TrackListContext = createContext<{ context: PlayContext; tracks: TrackSource } | null>(null)
