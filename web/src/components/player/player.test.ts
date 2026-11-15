import { describe, expect, it, vi } from 'vitest'
import { trackSummary } from '@/testing/fixtures'
import { Player } from './player'
import { upcoming } from './queue'

// A stand-in <audio>: events fire only when a test says so, like a real file loading
class FakeAudio extends EventTarget {
  src = ''
  paused = true
  currentTime = 0
  duration = NaN
  readyState = 0
  volume = 1
  preload = ''
  play = vi.fn(async () => {
    this.paused = false
  })
  pause = vi.fn(() => {
    if (this.paused) return
    this.paused = true
    this.fire('pause')
  })
  load = vi.fn()
  removeAttribute(name: string) {
    if (name === 'src') this.src = ''
  }
  fire(type: string) {
    this.dispatchEvent(new Event(type))
  }
  /** The file loads and starts: index read (length known), then playing. */
  start(duration = 200) {
    this.duration = duration
    this.fire('loadedmetadata')
    this.fire('durationchange')
    this.fire('playing')
  }
  end() {
    this.currentTime = this.duration
    this.paused = true
    this.fire('pause')
    this.fire('ended')
  }
}

const album = { type: 'ALBUM' as const, id: 'al1', name: 'Album', href: '/bob/albums/album' }
const [a, b, c] = ['a', 'b', 'c'].map((id) => trackSummary(id))
const flush = () => new Promise((r) => setTimeout(r, 0))

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

function setup(storage = memoryStorage()) {
  const audio = new FakeAudio()
  let urlVersion = 0
  const getStreamUrl = vi.fn(async (trackId: string, fresh: boolean) => {
    if (fresh) urlVersion++
    return { url: `https://s3/${trackId}?v=${urlVersion}`, expiresAt: Date.now() + 6 * 3600_000 }
  })
  const onTrackError = vi.fn()
  const onLoadError = vi.fn()
  const reportProgress = vi.fn()
  const player = new Player(
    { getStreamUrl, onTrackError, onLoadError, reportProgress, storage, storageKey: 'test' },
    audio as unknown as HTMLAudioElement,
  )
  return {
    audio,
    player,
    getStreamUrl,
    onTrackError,
    onLoadError,
    reportProgress,
    storage,
    status: () => player.getSnapshot().status,
  }
}

describe('Player', () => {
  it('plays the track pressed and fetches the next one’s URL ahead', async () => {
    const { audio, player, getStreamUrl, status } = setup()
    player.play(album, [a, b, c])
    expect(status()).toBe('loading')
    await flush()
    expect(audio.src).toBe('https://s3/a?v=0')
    expect(audio.play).toHaveBeenCalled()
    expect(getStreamUrl).toHaveBeenCalledWith('b', false)
    audio.start()
    expect(status()).toBe('playing')
    expect(player.getSnapshot().duration).toBe(200)
  })

  it('unlocks the audio element in the tap, before the tracks have loaded (iOS)', () => {
    const { audio, player } = setup()
    player.play(album, () => new Promise(() => {}))
    expect(audio.src).toMatch(/^data:audio\/wav;base64,/)
    expect(audio.play).toHaveBeenCalledTimes(1)
  })

  it('moves on when a track ends, and stops at the end of the context', async () => {
    const { audio, player, status } = setup()
    player.play(album, [a, b])
    await flush()
    audio.start()
    audio.end()
    await flush()
    expect(audio.src).toBe('https://s3/b?v=0')
    audio.start()
    audio.end()
    expect(status()).toBe('ended')
    // Play then starts it again from the top
    player.toggle()
    await flush()
    expect(audio.src).toBe('https://s3/a?v=0')
  })

  it('repeat one plays the same track again', async () => {
    const { audio, player } = setup()
    player.play(album, [a, b])
    player.cycleRepeat()
    player.cycleRepeat()
    await flush()
    audio.start()
    audio.end()
    await flush()
    expect(audio.src).toBe('https://s3/a?v=0')
    expect(audio.currentTime).toBe(0)
    expect(audio.play).toHaveBeenCalledTimes(3) // unlock, first play, the repeat
  })

  it('Back restarts the track past 3 seconds and goes to the previous one before', async () => {
    const { audio, player } = setup()
    player.play(album, [a, b], { startTrackId: 'b' })
    await flush()
    audio.start()
    audio.currentTime = 10
    player.back()
    expect(audio.currentTime).toBe(0)
    expect(audio.src).toBe('https://s3/b?v=0')
    player.next()
    player.back()
    // Next from B ran out (and stopped), so Back went to the start of B again
    expect(audio.src).toBe('https://s3/b?v=0')
  })

  it('Back early in a track goes to the one before', async () => {
    const { audio, player } = setup()
    player.play(album, [a, b])
    await flush()
    player.next()
    await flush()
    audio.start()
    audio.currentTime = 1
    player.back()
    await flush()
    expect(audio.src).toBe('https://s3/a?v=0')
  })

  it('an expired URL is fetched afresh and playback carries on from the same second', async () => {
    const { audio, player, getStreamUrl, onTrackError } = setup()
    player.play(album, [a, b])
    await flush()
    audio.start()
    audio.currentTime = 42
    audio.fire('error')
    await flush()
    expect(getStreamUrl).toHaveBeenCalledWith('a', true)
    expect(audio.src).toBe('https://s3/a?v=1')
    audio.fire('loadedmetadata')
    expect(audio.currentTime).toBe(42)
    expect(onTrackError).not.toHaveBeenCalled()
  })

  it('a track that still fails is reported and skipped', async () => {
    const { audio, player, onTrackError } = setup()
    player.play(album, [a, b])
    await flush()
    audio.fire('error')
    await flush()
    audio.fire('error')
    await flush()
    expect(onTrackError).toHaveBeenCalledWith(a)
    await flush()
    expect(audio.src).toBe('https://s3/b?v=1')
  })

  it("a track whose URL can't be fetched (gone, unshared) is reported and skipped", async () => {
    const { audio, player, getStreamUrl, onTrackError } = setup()
    getStreamUrl.mockRejectedValueOnce(new Error('404'))
    player.play(album, [a, b])
    await flush()
    await flush()
    expect(onTrackError).toHaveBeenCalledWith(a)
    expect(audio.src).toBe('https://s3/b?v=0')
  })

  it('says so when the tracks to play couldn’t be loaded', async () => {
    const { player, onLoadError } = setup()
    player.play(album, () => Promise.reject(new Error('offline')))
    await flush()
    expect(onLoadError).toHaveBeenCalled()
  })

  it('a pause while the URL is on its way sticks', async () => {
    const { audio, player, status } = setup()
    player.play(album, [a])
    player.toggle()
    expect(status()).toBe('paused')
    await flush()
    expect(audio.src).toBe('https://s3/a?v=0')
    expect(audio.play).toHaveBeenCalledTimes(1) // only the unlock
    expect(status()).toBe('paused')
  })

  it('starts from the tapped row', async () => {
    const { audio, player } = setup()
    player.play(album, [a, b, c], { startTrackId: 'c' })
    await flush()
    expect(audio.src).toBe('https://s3/c?v=0')
  })

  it('plays a context that loads after the tap, resuming at a track and second', async () => {
    const { audio, player } = setup()
    player.playLoaded(async () => ({ context: album, tracks: [a, b] }), { startTrackId: 'b', startAt: 30 })
    await flush()
    await flush()
    expect(audio.src).toBe('https://s3/b?v=0')
    audio.fire('loadedmetadata')
    expect(audio.currentTime).toBe(30)
  })

  it('saves the resume point as each track starts, on pause, and clears it at the end', async () => {
    const { audio, player, reportProgress } = setup()
    player.play(album, [a])
    expect(reportProgress).toHaveBeenLastCalledWith({ contextType: 'ALBUM', contextId: 'al1', trackId: 'a', positionSeconds: 0 })
    await flush()
    audio.start()
    audio.currentTime = 12.7
    player.toggle()
    expect(reportProgress).toHaveBeenLastCalledWith({ contextType: 'ALBUM', contextId: 'al1', trackId: 'a', positionSeconds: 12 })
    player.toggle()
    audio.start()
    audio.end()
    expect(reportProgress).toHaveBeenLastCalledWith({ completed: true })
  })

  it('a list (a profile’s tracks) is saved by its own id, for the app to rebuild', () => {
    const { player, reportProgress } = setup()
    player.play({ type: 'LIST', id: 'my-tracks', name: 'Your tracks', href: '/me' }, [a, b])
    expect(reportProgress).toHaveBeenLastCalledWith({ contextType: 'LIST', contextId: 'my-tracks', trackId: 'a', positionSeconds: 0 })
  })

  it('a track from Up next resumes alone, since it isn’t part of the context', async () => {
    const { audio, player, reportProgress } = setup()
    player.play(album, [a, b])
    await flush()
    audio.start()
    player.playNext([c])
    player.next()
    expect(reportProgress).toHaveBeenLastCalledWith({ contextType: 'TRACK', contextId: 'c', trackId: 'c', positionSeconds: 0 })
  })

  it('a tab that has only been handed a queue never saves the resume point, so hiding it can’t overwrite another device’s', async () => {
    const storage = memoryStorage()
    const first = setup(storage)
    first.player.play(album, [a, b])
    await flush()
    first.audio.start()
    first.player.toggle()

    // A reload: restored, paused
    const restored = setup(storage)
    restored.player.restore()
    restored.player.saveProgress()
    expect(restored.reportProgress).not.toHaveBeenCalled()

    // A fresh tab: cued from the server, paused
    const cued = setup()
    cued.player.cue(async () => ({ context: album, tracks: [a, b] }), { startTrackId: 'b', startAt: 30 })
    await flush()
    cued.player.saveProgress()
    expect(cued.reportProgress).not.toHaveBeenCalled()

    // Until it plays: then it saves as usual
    cued.player.toggle()
    await flush()
    cued.audio.start()
    cued.audio.currentTime = 31
    cued.player.saveProgress()
    expect(cued.reportProgress).toHaveBeenLastCalledWith({ contextType: 'ALBUM', contextId: 'al1', trackId: 'b', positionSeconds: 31 })
  })

  it('cues the server’s resume point with the rest of its list after it', async () => {
    const { player } = setup()
    player.cue(async () => ({ context: album, tracks: [a, b, c] }), { startTrackId: 'b', startAt: 40 })
    await flush()
    const queue = player.getQueue()
    expect(queue.context).toEqual(album)
    expect(queue.timeline[queue.cursor].id).toBe('b')
    expect(upcoming(queue).fromContext.map((t) => t.id)).toEqual(['c'])
  })

  it('saves the resume point every 15 seconds while playing', async () => {
    vi.useFakeTimers()
    try {
      const { audio, player, reportProgress } = setup()
      player.play(album, [a])
      await vi.advanceTimersByTimeAsync(0)
      audio.start()
      reportProgress.mockClear()
      audio.currentTime = 15
      await vi.advanceTimersByTimeAsync(15_000)
      expect(reportProgress).toHaveBeenCalledWith(expect.objectContaining({ positionSeconds: 15 }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('brings the queue back after a reload, paused where it was', async () => {
    const storage = memoryStorage()
    const first = setup(storage)
    first.player.play(album, [a, b], { startTrackId: 'b' })
    await flush()
    first.audio.start()
    first.audio.currentTime = 20
    first.player.toggle() // pausing saves the playhead

    const second = setup(storage)
    second.player.restore()
    expect(second.player.getQueue().context).toEqual(album)
    expect(second.status()).toBe('paused')
    await flush()
    expect(second.audio.src).toBe('https://s3/b?v=0')
    expect(second.audio.play).not.toHaveBeenCalled()
    second.audio.fire('loadedmetadata')
    expect(second.audio.currentTime).toBe(20)
  })

  it('Play as the first tap after a restore plays that track from where it was, not the silent clip', async () => {
    const storage = memoryStorage()
    const first = setup(storage)
    first.player.play(album, [a, b], { startTrackId: 'b' })
    await flush()
    first.audio.start()
    first.audio.currentTime = 20
    first.player.toggle()

    const second = setup(storage)
    second.player.restore()
    await flush()
    second.audio.fire('loadedmetadata') // the paused track's index has loaded, at 0:20
    second.audio.readyState = 1
    second.player.toggle() // the first tap: unlock() plays the silent clip on this element first

    expect(second.audio.src).toBe('https://s3/b?v=0')
    expect(second.audio.play).toHaveBeenCalled()
    second.audio.currentTime = 0 // a new src starts over…
    second.audio.fire('loadedmetadata')
    expect(second.audio.currentTime).toBe(20) // …and is put back where it was
  })

  it('Play on a track paused past its URL’s expiry carries on from the same second on a fresh URL', async () => {
    vi.useFakeTimers()
    try {
      const { audio, player, getStreamUrl } = setup()
      player.play(album, [a, b])
      await vi.advanceTimersByTimeAsync(0)
      audio.start()
      audio.currentTime = 42
      player.toggle()
      vi.setSystemTime(Date.now() + 7 * 3600_000) // left overnight

      player.toggle()
      await vi.advanceTimersByTimeAsync(0)
      expect(getStreamUrl).toHaveBeenCalledWith('a', true)
      expect(audio.src).toBe('https://s3/a?v=1')
      audio.currentTime = 0
      audio.fire('loadedmetadata')
      expect(audio.currentTime).toBe(42)
      expect(audio.play).toHaveBeenCalledTimes(3) // the silent clip, the track, and again here
    } finally {
      vi.useRealTimers()
    }
  })

  it('says playing only once the audio really is', async () => {
    const { audio, player, status } = setup()
    player.play(album, [a])
    await flush()
    audio.start()
    player.toggle()
    player.toggle()
    expect(status()).toBe('loading')
    audio.fire('playing')
    expect(status()).toBe('playing')
  })
})
