import type { TrackSummary } from '@/types/api'
import { PlayerEngine, type EngineSnapshot } from './player-engine'
import type { StreamUrl } from './stream'
import {
  addToQueue,
  back,
  currentTrack,
  cycleRepeat,
  emptyQueue,
  jumpTo,
  moveInContext,
  moveInQueue,
  next,
  peekNext,
  playNext,
  removeFromQueue,
  setLiked,
  setShuffle,
  start,
  type PlayContext,
  type QueueSection,
  type QueueState,
} from './queue'

/** What PUT /me/progress takes: where to resume, or that there's nothing to resume. */
export type ProgressReport =
  | { contextType: PlayContext['type']; contextId: string; trackId: string; positionSeconds: number }
  | { completed: true }

type Options = {
  getStreamUrl: (trackId: string, fresh: boolean) => Promise<StreamUrl>
  /** A track couldn't be played; the player has already moved on if it could. */
  onTrackError: (track: TrackSummary) => void
  /** Play was pressed on something whose tracks couldn't be loaded. */
  onLoadError: () => void
  /** Save the resume point (the server's single slot, put back in the player on sign-in). */
  reportProgress?: (report: ProgressReport) => void
  /** Where the queue survives a reload (sessionStorage in the app), under a key per
   *  person, so someone signing in after someone else in the same tab never gets theirs. */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  storageKey?: string
}

/** Tracks, or a way to fetch them (e.g. every page of an album) after the tap. */
export type TrackSource = TrackSummary[] | (() => Promise<TrackSummary[]>)

/** A context known only once loaded (the resume point, an album card): its name and
 *  tracks come from the server after the tap. */
export type ContextLoader = () => Promise<{ context: PlayContext; tracks: TrackSummary[] }>

export type PlayOptions = {
  /** Start at this track of the list (a tapped row); the first when it isn't there. */
  startTrackId?: string
  /** Start this many seconds in (resuming). */
  startAt?: number
}

/** After this many tracks in a row fail, stop rather than skip on (and toast) forever. */
const MAX_FAILURES_IN_A_ROW = 3

/** Back restarts the track past this many seconds, and goes to the previous one before. */
export const RESTART_AFTER_SECONDS = 3

/** How often the resume point is saved while playing (and on every pause/track change). */
export const PROGRESS_EVERY_MS = 15_000

type Saved = { queue: QueueState; position: number }

// The player: the queue (queue.ts) plus the audio element (player-engine.ts), wired so
// the queue moves on when a track ends. Plain TypeScript, held once by PlayerProvider;
// components read it through use-player.ts.
export class Player {
  readonly engine: PlayerEngine
  private readonly options: Options
  private queue: QueueState = emptyQueue
  private readonly listeners = new Set<() => void>()
  private failures = 0
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private lastStatus: EngineSnapshot['status'] = 'idle'
  /** Whether this tab has played anything: one that only holds a restored or cued queue
   *  never saves the resume point, or hiding it would overwrite what another tab or
   *  device has played since. */
  private hasPlayed = false

  constructor(options: Options, audio?: HTMLAudioElement) {
    this.options = options
    this.engine = new PlayerEngine(
      {
        getStreamUrl: options.getStreamUrl,
        onEnded: () => this.handleEnded(),
        onError: () => this.handleError(),
      },
      audio,
    )
    this.engine.subscribe(() => this.handleStatus())
  }

  // ---- for useSyncExternalStore ----

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  getQueue = () => this.queue

  getSnapshot = (): EngineSnapshot => this.engine.getSnapshot()

  private setQueue(queue: QueueState) {
    this.queue = queue
    this.save()
    for (const listener of this.listeners) listener()
  }

  // ---- what happens around playback ----

  private handleStatus() {
    const { status } = this.engine.getSnapshot()
    if (status === this.lastStatus) return
    const was = this.lastStatus
    this.lastStatus = status
    if (status === 'playing') {
      this.hasPlayed = true
      this.failures = 0
      this.heartbeat ??= setInterval(() => this.saveProgress(), PROGRESS_EVERY_MS)
    } else if (this.heartbeat) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }
    // Paused: remember exactly where
    if (was === 'playing' && status === 'paused') this.saveProgress()
  }

  /** Load whatever the queue now points at, and fetch the following track's URL ahead. */
  private loadCurrent(startAt = 0, autoplay = true) {
    const track = currentTrack(this.queue)
    if (!track) return
    if (autoplay) this.hasPlayed = true
    void this.engine.load(track.id, { startAt, autoplay })
    this.saveProgress(startAt)
    const upcoming = peekNext(this.queue)
    if (upcoming) this.options.getStreamUrl(upcoming.id, false).catch(() => {})
  }

  private goNext() {
    const queue = next(this.queue)
    if (!queue) {
      this.engine.finish()
      // Played to the end: nothing to resume
      this.options.reportProgress?.({ completed: true })
      return
    }
    this.setQueue(queue)
    this.loadCurrent()
  }

  private handleEnded() {
    if (this.queue.repeat === 'one') return void this.engine.play()
    this.goNext()
  }

  private handleError() {
    const track = currentTrack(this.queue)
    if (track) this.options.onTrackError(track)
    this.failures += 1
    if (this.failures < MAX_FAILURES_IN_A_ROW && peekNext(this.queue)) this.goNext()
  }

  /** Save the resume point to the server and the queue (with the playhead) for a reload. */
  saveProgress(position = this.engine.audio.currentTime) {
    const track = currentTrack(this.queue)
    const { context } = this.queue
    this.save(position)
    if (!track || !context || !this.hasPlayed) return
    // A track from the listener's own queue isn't part of the context: it resumes alone
    const isInContext = this.queue.tracks.some((t) => t.id === track.id)
    this.options.reportProgress?.({
      contextType: isInContext ? context.type : 'TRACK',
      contextId: isInContext ? context.id : track.id,
      trackId: track.id,
      positionSeconds: Math.floor(position),
    })
  }

  private get storageKey() {
    return this.options.storageKey ?? 'melomelo.player'
  }

  private save(position = this.engine.audio.currentTime) {
    const { storage } = this.options
    if (!storage) return
    try {
      if (!currentTrack(this.queue)) storage.removeItem(this.storageKey)
      else storage.setItem(this.storageKey, JSON.stringify({ queue: this.queue, position } satisfies Saved))
    } catch {
      // Storage full or blocked: the queue just won't survive a reload
    }
  }

  /** After a reload: bring back the queue, paused where it was (the browser won't let it
   *  start without a tap). False when this tab had nothing saved. */
  restore(): boolean {
    let saved: Saved | null = null
    try {
      const raw = this.options.storage?.getItem(this.storageKey)
      saved = raw ? (JSON.parse(raw) as Saved) : null
    } catch {
      saved = null
    }
    if (!saved || !currentTrack(saved.queue)) return false
    this.queue = saved.queue
    for (const listener of this.listeners) listener()
    const track = currentTrack(saved.queue)!
    void this.engine.load(track.id, { startAt: saved.position, autoplay: false })
    return true
  }

  /** On signing in (a fresh tab): put the server's resume point in the player, paused at
   *  that track and second, ready for Play. Ignored if something has started meanwhile. */
  cue(load: ContextLoader, { startTrackId, startAt = 0 }: PlayOptions) {
    load().then(
      ({ context, tracks }) => {
        if (currentTrack(this.queue) || tracks.length === 0) return
        const startIndex = Math.max(0, startTrackId ? tracks.findIndex((t) => t.id === startTrackId) : 0)
        this.setQueue(start(this.queue, context, tracks, startIndex))
        const track = currentTrack(this.queue)
        if (track) void this.engine.load(track.id, { startAt, autoplay: false })
      },
      () => {}, // nothing to resume is fine
    )
  }

  // ---- controls (call from a tap: each unlocks the audio element for iOS first) ----

  /** Play `tracks` as `context`, from a given track and second. */
  play(context: PlayContext, tracks: TrackSource, options: PlayOptions = {}) {
    this.engine.unlock()
    if (Array.isArray(tracks)) this.begin(context, tracks, options)
    else tracks().then((list) => this.begin(context, list, options), () => this.options.onLoadError())
  }

  /** Play a context that has to be loaded first. */
  playLoaded(load: ContextLoader, options: PlayOptions = {}) {
    this.engine.unlock()
    load().then(({ context, tracks }) => this.begin(context, tracks, options), () => this.options.onLoadError())
  }

  private begin(context: PlayContext, tracks: TrackSummary[], { startTrackId, startAt = 0 }: PlayOptions) {
    if (tracks.length === 0) return this.options.onLoadError()
    this.failures = 0
    const startIndex = Math.max(0, startTrackId ? tracks.findIndex((t) => t.id === startTrackId) : 0)
    this.setQueue(start(this.queue, context, tracks, startIndex))
    this.loadCurrent(startAt)
  }

  toggle() {
    const { status } = this.engine.getSnapshot()
    if (status === 'playing' || status === 'loading') return this.engine.pause()
    this.engine.unlock()
    const { context, tracks } = this.queue
    // The queue ran out: Play starts what was playing again from the top
    if (status === 'ended' && context && !peekNext(this.queue)) return this.play(context, tracks)
    // It failed: try that track again
    if (status === 'error') return this.loadCurrent()
    void this.engine.play()
  }

  next() {
    this.engine.unlock()
    this.goNext()
  }

  back() {
    this.engine.unlock()
    const queue = this.engine.audio.currentTime > RESTART_AFTER_SECONDS ? null : back(this.queue)
    if (!queue) {
      // Restart the current track, carrying on playing if it had finished
      const { status } = this.engine.getSnapshot()
      this.engine.seek(0)
      if (status === 'ended') void this.engine.play()
      return
    }
    this.setQueue(queue)
    this.loadCurrent()
  }

  seek(seconds: number) {
    this.engine.seek(seconds)
  }

  setVolume(volume: number) {
    this.engine.setVolume(volume)
  }

  playNext(tracks: TrackSummary[]) {
    this.setQueue(playNext(this.queue, tracks))
  }

  addToQueue(tracks: TrackSummary[]) {
    this.setQueue(addToQueue(this.queue, tracks))
  }

  /** A track was liked or unliked somewhere in the app. */
  setLiked(trackId: string, liked: boolean) {
    const queue = setLiked(this.queue, trackId, liked)
    if (queue !== this.queue) this.setQueue(queue)
  }

  /** A row tapped in the queue view: play it now. */
  jumpTo(section: QueueSection, index: number) {
    this.engine.unlock()
    const queue = jumpTo(this.queue, section, index)
    if (queue === this.queue) return
    this.failures = 0
    this.setQueue(queue)
    this.loadCurrent()
  }

  /** A row dragged within its part of the queue view. */
  move(section: 'upNext' | 'context', from: number, to: number) {
    this.setQueue(section === 'upNext' ? moveInQueue(this.queue, from, to) : moveInContext(this.queue, from, to))
  }

  removeFromQueue(index: number) {
    this.setQueue(removeFromQueue(this.queue, index))
  }

  toggleShuffle() {
    this.setQueue(setShuffle(this.queue, !this.queue.isShuffled))
  }

  cycleRepeat() {
    this.setQueue(cycleRepeat(this.queue))
  }

  /** Stop and forget everything (the signed-in app is closing). */
  stop() {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
    this.engine.stop()
    this.queue = emptyQueue
    for (const listener of this.listeners) listener()
  }
}
