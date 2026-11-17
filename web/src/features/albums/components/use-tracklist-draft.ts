import { useState } from 'react'
import { LIMITS } from '@/config/limits'
import type { TrackSummary } from '@/types/api'

const idsOf = (tracks: TrackSummary[]) => tracks.map((track) => track.id).join(',')

/** An album's tracks while they're being edited — nothing is sent until the form saves —
 *  and the picker's ticks while "Add tracks" is open (`picked`, null when it isn't). */
export function useTracklistDraft(initial: TrackSummary[]) {
  const [start] = useState(() => idsOf(initial))
  const [tracks, setTracks] = useState(initial)
  const [picked, setPicked] = useState<Map<string, TrackSummary> | null>(null)

  return {
    tracks,
    isDirty: idsOf(tracks) !== start,
    move(from: number, to: number) {
      setTracks((list) => {
        const next = [...list]
        next.splice(to, 0, ...next.splice(from, 1))
        return next
      })
    },
    remove: (id: string) => setTracks((list) => list.filter((track) => track.id !== id)),

    picked,
    startPicking: () => setPicked(new Map(tracks.map((track) => [track.id, track]))),
    cancelPicking: () => setPicked(null),
    toggle(track: TrackSummary) {
      setPicked((current) => {
        if (!current) return current
        const next = new Map(current)
        if (!next.delete(track.id) && next.size < LIMITS.albumTracks) next.set(track.id, track)
        return next
      })
    },
    /** The album's tracks keep their order (minus the unticked); newly ticked ones go on
     *  the end, in the order they were ticked. */
    donePicking() {
      if (picked) setTracks([...picked.values()])
      setPicked(null)
    },
  }
}

export type TracklistDraft = ReturnType<typeof useTracklistDraft>
