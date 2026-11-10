import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { sileo } from 'sileo'
import { api } from '@/lib/api-client'
import { useUsername } from '@/lib/auth/auth-context'
import { fetchResumePoint, loadResumeContext } from './load-context'
import { useMediaSession } from './media-session'
import { Player } from './player'
import { PlayerContext } from './player-context'
import { fetchStreamUrl } from './stream'
import { useCurrentTrack, usePlayerState } from './use-player'

function sessionStore() {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

// One player for the signed-in app (in AppLayout, above the phone/desktop switch, so
// resizing never interrupts it). Signing out unmounts it, which stops the audio.
// The queue survives a reload of the tab (sessionStorage), paused where it was. The
// resume point is saved to the server (PUT /me/progress) as it plays, on pause and when
// the page is hidden; a fresh tab (signing in, another device) puts it back in the
// player, paused at that track and second.
export function PlayerProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const username = useUsername()
  const [player] = useState(
    () =>
      new Player({
        getStreamUrl: (trackId, fresh) => fetchStreamUrl(queryClient, trackId, fresh),
        onTrackError: (track) =>
          sileo.error({ title: `Couldn't play ${track.name}`, description: 'It may have been deleted or unshared.' }),
        onLoadError: () => sileo.error({ title: "Couldn't play this", description: 'Please try again.' }),
        reportProgress: (report) => {
          // keepalive: the last save as the page closes still goes out
          api('/me/progress', { method: 'PUT', body: report, keepalive: true }).catch(() => {})
        },
        storage: sessionStore(),
        storageKey: `melomelo.player.${username}`,
      }),
  )

  useEffect(() => {
    let isCancelled = false
    if (!player.restore())
      fetchResumePoint()
        .then((resume) => {
          if (resume && !isCancelled)
            player.cue(() => loadResumeContext(resume, username), {
              startTrackId: resume.trackId,
              startAt: resume.positionSeconds,
            })
        })
        .catch(() => {})
    // Switching away (or closing the tab) saves where you are
    const onHidden = () => {
      if (document.visibilityState === 'hidden') player.saveProgress()
    }
    const onPageHide = () => player.saveProgress()
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      isCancelled = true
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', onPageHide)
      player.stop()
    }
  }, [player, username])

  return (
    <PlayerContext.Provider value={player}>
      <MediaSession player={player} />
      {children}
    </PlayerContext.Provider>
  )
}

function MediaSession({ player }: { player: Player }) {
  const track = useCurrentTrack()
  const { status } = usePlayerState()
  useMediaSession(player, track, status.status)
  return null
}
