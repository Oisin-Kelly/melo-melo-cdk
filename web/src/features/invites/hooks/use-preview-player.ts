import { useCallback, useEffect, useRef, useState } from 'react'

export type PreviewItem = { id: string; url: string }

// The invite screen's player: one preview at a time through a single <audio> element, either a
// single track or a queue played back to back (an album's "Preview all"). Starts only from a tap
// (iOS won't play audio otherwise) — never on load. Deliberately small and separate from the
// app's main player, which doesn't exist yet.
export function usePreviewPlayer({ onError }: { onError?: () => void } = {}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const queueRef = useRef<PreviewItem[]>([])
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [isPlayingAll, setIsPlayingAll] = useState(false)

  const stop = useCallback(() => {
    queueRef.current = []
    audioRef.current?.pause()
    setIsPlayingAll(false)
    setPlayingId(null)
    setProgress(0)
  }, [])

  const start = useCallback(
    (item: PreviewItem) => {
      audioRef.current ??= new Audio()
      const audio = audioRef.current
      audio.src = item.url
      setPlayingId(item.id)
      setProgress(0)
      audio.play().catch(() => {
        // A preview URL that has run out, or a blocked/failed load
        stop()
        onErrorRef.current?.()
      })
    },
    [stop],
  )

  useEffect(() => {
    audioRef.current ??= new Audio()
    const audio = audioRef.current
    const onTime = () => setProgress(audio.duration ? audio.currentTime / audio.duration : 0)
    const onEnded = () => {
      const next = queueRef.current.shift()
      if (next) start(next)
      else stop()
    }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnded)
      audio.pause()
    }
  }, [start, stop])

  /** Plays one preview, or stops it if it's the one playing. */
  const toggle = useCallback(
    (item: PreviewItem) => {
      if (playingId === item.id) return stop()
      queueRef.current = []
      setIsPlayingAll(false)
      start(item)
    },
    [playingId, start, stop],
  )

  /** Plays every preview in order. */
  const playAll = useCallback(
    (items: PreviewItem[]) => {
      if (items.length === 0) return
      queueRef.current = items.slice(1)
      setIsPlayingAll(true)
      start(items[0])
    },
    [start],
  )

  return { playingId, progress, isPlayingAll, toggle, playAll, stop }
}
