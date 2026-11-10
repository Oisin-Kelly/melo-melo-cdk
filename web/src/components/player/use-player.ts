import { useContext, useSyncExternalStore } from 'react'
import { sileo } from 'sileo'
import type { TrackSummary } from '@/types/api'
import { trackContext } from './load-context'
import type { ContextLoader, TrackSource } from './player'
import type { EngineSnapshot } from './player-engine'
import { PlayerContext, TrackListContext } from './player-context'
import { currentTrack, emptyQueue, type PlayContext, type QueueState } from './queue'

const idle: EngineSnapshot = { status: 'idle', isBuffering: false, duration: 0 }
const noop = () => () => {}

/** The player, for its controls; null outside the signed-in app (and in tests without one). */
export function usePlayer() {
  return useContext(PlayerContext)
}

/** The queue and playback status. Re-renders on changes to either, not on the clock. */
export function usePlayerState(): { queue: QueueState; status: EngineSnapshot } {
  const player = usePlayer()
  const queue = useSyncExternalStore(player?.subscribe ?? noop, player?.getQueue ?? (() => emptyQueue))
  const status = useSyncExternalStore(player?.engine.subscribe ?? noop, player?.getSnapshot ?? (() => idle))
  return { queue, status }
}

/** Where the music is playing from (an album, a playlist), for "Playing from …"; null
 *  when it's a single track, which needs no saying. */
export function usePlayingFrom() {
  const { context } = usePlayerState().queue
  return context && context.type !== 'TRACK' ? context : null
}

export function useCurrentTrack() {
  return currentTrack(usePlayerState().queue)
}

/** The playhead in seconds, for the scrubber and times only: re-renders a few times a second. */
export function usePlaybackPosition(): number {
  const engine = usePlayer()?.engine
  return useSyncExternalStore(engine?.subscribePosition ?? noop, engine?.getPosition ?? (() => 0))
}

/** A page's Play button for a whole context: plays it (fetching its tracks after the tap if
 *  need be), or pauses/resumes it when it's already what's playing. `onPlay` is undefined
 *  until the context is known and where there's no player, which leaves the button disabled. */
export function usePlayContext(context: PlayContext | null, tracks: TrackSource) {
  const player = usePlayer()
  const { queue, status } = usePlayerState()
  const isCurrent = context !== null && queue.context?.type === context.type && queue.context.id === context.id
  const isActive = isCurrent && status.status !== 'ended' && status.status !== 'error'
  const isPlaying = isActive && (status.status === 'playing' || status.status === 'loading')
  const onPlay =
    player && context
      ? () => {
          if (isActive) player.toggle()
          else player.play(context, tracks)
        }
      : undefined
  return { isPlaying, onPlay }
}

const isLive = (status: EngineSnapshot['status']) => status !== 'ended' && status !== 'error' && status !== 'idle'

/** A play button for something loaded after the tap (an album card, Continue listening):
 *  `contextKey` says which context it is, so the button can show Pause while it plays. */
export function usePlayLoaded(contextKey: { type: PlayContext['type']; id: string }, load: ContextLoader) {
  const player = usePlayer()
  const { queue, status } = usePlayerState()
  const isCurrent = queue.context?.type === contextKey.type && queue.context.id === contextKey.id
  const isActive = isCurrent && isLive(status.status)
  const isPlaying = isActive && (status.status === 'playing' || status.status === 'loading')
  const onPlay = player ? () => (isActive ? player.toggle() : player.playLoaded(load)) : undefined
  return { isPlaying, onPlay }
}

/** A track row: whether it's the one playing, and what tapping it does — play its list
 *  from here (or just it, outside a list), or pause/resume it if it's already playing. */
export function useTrackRowPlay(track: TrackSummary) {
  const player = usePlayer()
  const list = useContext(TrackListContext)
  const { queue, status } = usePlayerState()
  const isCurrent = currentTrack(queue)?.id === track.id
  const isActive = isCurrent && isLive(status.status)
  const isPlaying = isActive && (status.status === 'playing' || status.status === 'loading')
  const onPlay = player
    ? () => {
        if (isActive) player.toggle()
        else if (list) player.play(list.context, list.tracks, { startTrackId: track.id })
        else player.play(trackContext(track), [track])
      }
    : undefined
  return { isCurrent, isPlaying, onPlay }
}

/** Play next / Add to queue (a track, or a whole album or playlist — fetched after the
 *  tap if need be). With nothing playing yet, they just play the tracks. */
export function useQueueActions() {
  const player = usePlayer()
  const { queue } = usePlayerState()
  if (!player) return null
  const isIdle = !currentTrack(queue)

  const run = async (where: 'next' | 'last', source: TrackSource, context?: PlayContext) => {
    // In the tap, before any wait: lets iOS start the audio if this ends up playing it
    player.engine.unlock()
    let tracks: TrackSummary[]
    try {
      tracks = Array.isArray(source) ? source : await source()
    } catch {
      return sileo.error({ title: "Couldn't add that", description: 'Please try again.' })
    }
    if (tracks.length === 0) return
    if (isIdle) {
      const fallback = tracks.length === 1 ? trackContext(tracks[0]) : null
      const playAs = context ?? fallback ?? { type: 'LIST' as const, id: 'queue', name: 'Your queue', href: '/' }
      return player.play(playAs, tracks)
    }
    const count = tracks.length === 1 ? tracks[0].name : `${tracks.length} tracks`
    if (where === 'next') {
      player.playNext(tracks)
      sileo.success({ title: `${count} will play next` })
    } else {
      player.addToQueue(tracks)
      sileo.success({ title: `Added ${count} to the queue` })
    }
  }

  return {
    playNext: (source: TrackSource, context?: PlayContext) => void run('next', source, context),
    addToQueue: (source: TrackSource, context?: PlayContext) => void run('last', source, context),
  }
}
