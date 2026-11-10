import { useEffect } from 'react'
import { nameOf } from '@/types/user'
import type { TrackSummary } from '@/types/api'
import type { Player } from './player'
import type { EngineStatus } from './player-engine'

// The lock screen, Control Centre, headphone buttons and the browser's media hub: what's
// playing (title, who made it, cover) and the controls they can press. On iOS this is
// what puts MeloMelo on the lock screen.
export function useMediaSession(player: Player, track: TrackSummary | null, status: EngineStatus) {
  const session = typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null

  useEffect(() => {
    if (!session) return
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => player.toggle()],
      ['pause', () => player.engine.pause()],
      ['nexttrack', () => player.next()],
      ['previoustrack', () => player.back()],
      ['seekto', (details) => details.seekTime != null && player.seek(details.seekTime)],
    ]
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler)
      } catch {
        // An action this browser doesn't support
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null)
        } catch {
          // as above
        }
      }
    }
  }, [session, player])

  useEffect(() => {
    if (!session || typeof MediaMetadata === 'undefined') return
    session.metadata = track
      ? new MediaMetadata({
          title: track.name,
          artist: nameOf(track.owner),
          artwork: track.imageUrl ? [{ src: track.imageUrl, sizes: '400x400', type: 'image/jpeg' }] : [],
        })
      : null
  }, [session, track])

  useEffect(() => {
    if (!session) return
    session.playbackState = status === 'playing' || status === 'loading' ? 'playing' : track ? 'paused' : 'none'
    // The lock screen's progress bar: set on every change of state; it moves on by itself
    const audio = player.engine.audio
    const { duration } = player.getSnapshot()
    if (track && duration > 0 && 'setPositionState' in session) {
      try {
        session.setPositionState({ duration, position: Math.min(audio.currentTime, duration), playbackRate: 1 })
      } catch {
        // A position the browser rejects (mid-load)
      }
    }
  }, [session, player, track, status])
}
