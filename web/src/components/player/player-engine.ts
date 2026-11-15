// The one <audio> element the whole app plays through. Each track is a single AAC file
// (encoded with its index at the front), so the browser does the streaming itself: it
// range-requests bytes from S3 as it needs them, pauses on its own when the playhead
// catches up with the download ('waiting') and carries on when data arrives ('playing'),
// and a seek into a part it hasn't fetched just opens a new range request there. All
// this class adds is the stream URL, status for the UI, and one recovery: a presigned URL
// that has expired is fetched afresh and playback picks up at the same second, both when
// the file fails and, before it can, when Play resumes a track paused past its URL's
// expiry (a tab left overnight). The status only says playing once the element does.
//
// iOS only lets audio start from a tap, and only on an element a tap has started. So
// every play from a tap calls unlock() first, synchronously, before any network wait,
// and the app swaps the src of this one element rather than making new ones, which is
// also what lets the next track start by itself with the screen locked.

import type { StreamUrl } from './stream'

export type EngineStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'

export type EngineSnapshot = {
  status: EngineStatus
  /** Playing, but waiting for data (the playhead caught up with the download). */
  isBuffering: boolean
  /** Seconds; 0 until the file's index has loaded. */
  duration: number
}

type Options = {
  /** The track's stream URL; `fresh` skips any cached one (after the old one failed). */
  getStreamUrl: (trackId: string, fresh: boolean) => Promise<StreamUrl>
  /** The track played to its end by itself. */
  onEnded: () => void
  /** The track couldn't be played (gone, no access, or the network failed twice). */
  onError: (trackId: string) => void
}

/** A URL this close to expiring isn't resumed on: S3 would refuse the rest of the file. */
const EXPIRY_MARGIN_MS = 60_000

export class PlayerEngine {
  readonly audio: HTMLAudioElement
  private readonly options: Options
  private snapshot: EngineSnapshot = { status: 'idle', isBuffering: false, duration: 0 }
  private readonly listeners = new Set<() => void>()
  private trackId: string | null = null
  /** Bumped by every load, so a slow URL fetch for an older track is ignored. */
  private loadToken = 0
  private hasRetried = false
  private isUnlocked = false
  /** The current track's stream URL, and where it was when unlock() swapped in the silent
   *  clip (a track restored paused, then Play as the first tap): play() puts it back. */
  private source: StreamUrl | null = null
  private sourceAt = 0
  /** Where a just-set source starts, until its index has loaded. */
  private pendingStartAt = 0
  /** The stream URL is on its way (no src to play yet). */
  private isFetching = false
  /** Whether the listener wants it playing: a pause while the URL is on its way sticks. */
  private wantsToPlay = false
  /** The playhead, sampled on the element's own events (reading currentTime directly
   *  gives a new value on every read, which React's external stores don't allow). */
  private position = 0
  private readonly positionListeners = new Set<() => void>()

  constructor(options: Options, audio: HTMLAudioElement = new Audio()) {
    this.options = options
    this.audio = audio
    audio.preload = 'auto'
    // Events from the silent clip unlock() plays are ignored: they'd say "playing" while
    // the real track's URL is still on its way
    const on = (type: string, handler: () => void) =>
      audio.addEventListener(type, () => {
        if (this.isOwnSource()) handler()
      })
    on('playing', () => this.set({ status: 'playing', isBuffering: false }))
    on('waiting', () => this.set({ isBuffering: true }))
    on('canplay', () => this.set({ isBuffering: false }))
    on('pause', () => {
      if (this.snapshot.status === 'playing') this.set({ status: 'paused' })
    })
    on('durationchange', () => this.set({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 }))
    on('ended', () => {
      // A late 'ended' from the silent clip, delivered after the track's src was set
      if (audio.currentTime < this.snapshot.duration - 1) return
      this.set({ status: 'ended', isBuffering: false })
      this.options.onEnded()
    })
    audio.addEventListener('error', () => void this.recover())
    for (const type of ['timeupdate', 'seeking', 'seeked', 'emptied', 'loadedmetadata']) {
      audio.addEventListener(type, () => this.setPosition(this.isOwnSource() ? audio.currentTime : 0))
    }
  }

  subscribePosition = (listener: () => void) => {
    this.positionListeners.add(listener)
    return () => void this.positionListeners.delete(listener)
  }

  getPosition = () => this.position

  private setPosition(seconds: number) {
    if (seconds === this.position) return
    this.position = seconds
    for (const listener of this.positionListeners) listener()
  }

  // ---- for useSyncExternalStore ----

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  getSnapshot = () => this.snapshot

  private set(patch: Partial<EngineSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }

  /** Not the silent clip unlock() plays. */
  private isOwnSource() {
    return this.trackId !== null && !this.audio.src.startsWith('data:')
  }

  // ---- controls ----

  /** Call synchronously in a tap, before any await: lets iOS play this element later. */
  unlock() {
    if (this.isUnlocked) return
    this.isUnlocked = true
    // A track already loaded (restored paused): remember where, for play() to go back to it
    if (this.isOwnSource()) this.sourceAt = this.audio.readyState > 0 ? this.audio.currentTime : this.pendingStartAt
    this.audio.src = silentClip()
    this.audio.play().catch(() => {})
  }

  /** Load a track and (by default) play it, from `startAt` seconds. */
  async load(trackId: string, { startAt = 0, autoplay = true }: { startAt?: number; autoplay?: boolean } = {}) {
    const token = ++this.loadToken
    this.trackId = trackId
    this.hasRetried = false
    this.wantsToPlay = autoplay
    this.set({ status: autoplay ? 'loading' : 'paused', isBuffering: false, duration: 0 })
    let stream: StreamUrl
    this.isFetching = true
    try {
      stream = await this.options.getStreamUrl(trackId, false)
    } catch {
      if (token !== this.loadToken) return
      this.isFetching = false
      this.set({ status: 'error' })
      this.options.onError(trackId)
      return
    }
    if (token !== this.loadToken) return
    this.isFetching = false
    // Paused while the URL was on its way: load it, but don't start
    this.setSource(stream, startAt, this.wantsToPlay)
  }

  private setSource(stream: StreamUrl, startAt: number, autoplay: boolean) {
    const audio = this.audio
    this.source = stream
    this.pendingStartAt = startAt
    audio.src = stream.url
    audio.addEventListener(
      'loadedmetadata',
      () => {
        if (startAt > 0) audio.currentTime = startAt
        this.pendingStartAt = 0
      },
      { once: true },
    )
    if (autoplay) void this.play()
    else this.set({ status: 'paused' })
  }

  async play() {
    if (!this.trackId || this.snapshot.status === 'error') return
    this.wantsToPlay = true
    // Play again before the URL arrived (after a pause): load() starts it when it does
    if (this.isFetching) return this.set({ status: 'loading' })
    if (this.snapshot.status === 'ended') this.audio.currentTime = 0
    // Waiting on the element: its 'playing' event says when it really has started
    if (this.snapshot.status !== 'playing') this.set({ status: 'loading' })
    // unlock() swapped the loaded track for the silent clip: back to it, where it was
    const isSwapped = !this.isOwnSource()
    const at = isSwapped ? this.sourceAt : this.audio.currentTime
    if (this.source && this.source.expiresAt - Date.now() < EXPIRY_MARGIN_MS) return void this.refresh(at)
    if (isSwapped && this.source) {
      this.audio.src = this.source.url
      if (at > 0) this.audio.addEventListener('loadedmetadata', () => (this.audio.currentTime = at), { once: true })
    }
    try {
      await this.audio.play()
    } catch (error) {
      const { name } = error as Error
      // A newer load replaced this one: that one has its own status
      if (name === 'AbortError') return
      // The browser wants a tap first (e.g. resuming after a reload): paused, ready for it
      if (name === 'NotAllowedError') return this.set({ status: 'paused', isBuffering: false })
      // Anything else: the file can't be played as it is
      void this.recover()
    }
  }

  /** Resuming on a URL that has expired (or is about to): carry on at `at` from a fresh one. */
  private async refresh(at: number) {
    const token = this.loadToken
    const trackId = this.trackId!
    this.isFetching = true
    try {
      const stream = await this.options.getStreamUrl(trackId, true)
      if (token !== this.loadToken) return
      this.isFetching = false
      this.setSource(stream, at, this.wantsToPlay)
    } catch {
      if (token !== this.loadToken) return
      this.isFetching = false
      this.set({ status: 'error' })
      this.options.onError(trackId)
    }
  }

  pause() {
    this.wantsToPlay = false
    this.audio.pause()
    if (this.snapshot.status === 'loading') this.set({ status: 'paused', isBuffering: false })
  }

  seek(seconds: number) {
    const { duration } = this.snapshot
    this.audio.currentTime = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds)
    this.setPosition(this.audio.currentTime)
    // Seeking back from the end makes it playable again, paused where it was put
    if (this.snapshot.status === 'ended' && seconds < duration) this.set({ status: 'paused' })
  }

  /** Stop at the end of the current track: what the player shows when the queue runs out. */
  finish() {
    this.audio.pause()
    if (this.snapshot.duration > 0) this.audio.currentTime = this.snapshot.duration
    this.set({ status: 'ended', isBuffering: false })
  }

  setVolume(volume: number) {
    this.audio.volume = Math.min(Math.max(volume, 0), 1)
  }

  /** Stop and let go of the file (signing out, closing the app shell). */
  stop() {
    this.loadToken++
    this.isFetching = false
    this.trackId = null
    this.source = null
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    this.set({ status: 'idle', isBuffering: false, duration: 0 })
  }

  // The file failed to load or stopped mid-way. Most likely the presigned URL expired: fetch
  // a fresh one once and carry on from the same second; a second failure is reported.
  private async recover() {
    if (!this.isOwnSource() || !this.trackId) return
    const trackId = this.trackId
    const token = this.loadToken
    const at = this.audio.currentTime
    const wasPlaying = this.snapshot.status === 'playing' || this.snapshot.status === 'loading'
    if (!this.hasRetried) {
      this.hasRetried = true
      try {
        const stream = await this.options.getStreamUrl(trackId, true)
        if (token !== this.loadToken) return
        this.setSource(stream, at, wasPlaying)
        return
      } catch {
        if (token !== this.loadToken) return
      }
    }
    this.set({ status: 'error', isBuffering: false })
    this.options.onError(trackId)
  }
}

// A tenth of a second of silence (8 kHz 8-bit mono WAV), built once: what unlock() plays.
let silent: string | null = null
function silentClip(): string {
  if (silent) return silent
  const samples = 800
  const bytes = new Uint8Array(44 + samples)
  const view = new DataView(bytes.buffer)
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, 8000, true) // sample rate
  view.setUint32(28, 8000, true) // bytes per second
  view.setUint16(32, 1, true) // block align
  view.setUint16(34, 8, true) // bits per sample
  text(36, 'data')
  view.setUint32(40, samples, true)
  bytes.fill(128, 44) // 8-bit silence is the midpoint
  silent = `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`
  return silent
}
