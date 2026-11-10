import type { TrackSummary } from '@/types/api'

// What plays, and in what order: pure functions over one state object, so the rules
// can be tested on their own. The player (player-provider.tsx) holds the state and
// loads whichever track `current` points at.
//
// - context: where play was pressed (an album, a playlist, one track), in its own order
// - upNext: the listener's own queue ("Play next" / "Add to queue"), played before the
//   rest of the context
// - timeline: what has played, plus a cursor. Back steps the cursor back; Next steps it
//   forward again before drawing anything new, so Next undoes Back

export type RepeatMode = 'off' | 'all' | 'one'

/** Where playback started. The type and id are what resume (PUT /me/progress) records
 *  (a LIST — a profile's tracks, the Home feed — isn't something the server can reopen, so
 *  its tracks resume on their own); the name and link are what the player shows as
 *  "Playing from …". */
export type PlayContext = {
  type: 'TRACK' | 'ALBUM' | 'PLAYLIST' | 'LIST'
  id: string
  name: string
  href: string
}

export type QueueState = {
  context: PlayContext | null
  /** The context's tracks in their own order. */
  tracks: TrackSummary[]
  /** Indices into `tracks` in play order: their own order, or shuffled. */
  order: number[]
  /** How far into `order` playback has drawn (-1: nothing yet). */
  orderPos: number
  timeline: TrackSummary[]
  /** The current track's place in the timeline (-1: nothing playing). */
  cursor: number
  upNext: TrackSummary[]
  isShuffled: boolean
  repeat: RepeatMode
}

export const emptyQueue: QueueState = {
  context: null,
  tracks: [],
  order: [],
  orderPos: -1,
  timeline: [],
  cursor: -1,
  upNext: [],
  isShuffled: false,
  repeat: 'off',
}

/** Old timeline entries are dropped past this, so a long session can't grow it forever. */
export const TIMELINE_LIMIT = 200

type Random = () => number

export const currentTrack = (state: QueueState): TrackSummary | null => state.timeline[state.cursor] ?? null

const identity = (length: number) => Array.from({ length }, (_, i) => i)

// Fisher–Yates
export function shuffled<T>(items: T[], random: Random = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function withTimeline(state: QueueState, timeline: TrackSummary[], cursor: number): QueueState {
  const excess = Math.max(0, timeline.length - TIMELINE_LIMIT)
  return { ...state, timeline: timeline.slice(excess), cursor: cursor - excess }
}

/** Play `tracks` from `startIndex`. The listener's own queue, shuffle and repeat carry over. */
export function start(
  state: QueueState,
  context: PlayContext,
  tracks: TrackSummary[],
  startIndex = 0,
  random: Random = Math.random,
): QueueState {
  if (tracks.length === 0) return state
  const first = Math.min(Math.max(startIndex, 0), tracks.length - 1)
  const order = state.isShuffled
    ? [first, ...shuffled(identity(tracks.length).filter((i) => i !== first), random)]
    : identity(tracks.length)
  return {
    ...state,
    context,
    tracks,
    order,
    orderPos: order.indexOf(first),
    timeline: [tracks[first]],
    cursor: 0,
  }
}

/** The state after Next, or null when there's nothing left (playback stops). */
export function next(state: QueueState, random: Random = Math.random): QueueState | null {
  const { timeline, cursor } = state

  // The listener's own queue comes first, slotted in right after the current track
  if (state.upNext.length > 0) {
    const [track, ...rest] = state.upNext
    const moved = withTimeline(state, [...timeline.slice(0, cursor + 1), track, ...timeline.slice(cursor + 1)], cursor + 1)
    return { ...moved, upNext: rest }
  }

  // After Back: forward again along what already played
  if (cursor < timeline.length - 1) return { ...state, cursor: cursor + 1 }

  // Then the rest of the context; at its end, round again only on repeat all
  let { order, orderPos } = state
  orderPos += 1
  if (orderPos >= order.length) {
    if (state.repeat !== 'all' || state.tracks.length === 0) return null
    order = state.isShuffled ? shuffled(identity(state.tracks.length), random) : identity(state.tracks.length)
    orderPos = 0
  }
  const track = state.tracks[order[orderPos]]
  return withTimeline({ ...state, order, orderPos }, [...timeline, track], timeline.length)
}

/** What Next would play, without moving: for fetching its stream URL ahead of time. */
export function peekNext(state: QueueState): TrackSummary | null {
  // Repeat all's reshuffle is random, so only peek within the current order
  if (state.upNext.length > 0) return state.upNext[0]
  if (state.cursor < state.timeline.length - 1) return state.timeline[state.cursor + 1]
  const pos = state.orderPos + 1
  if (pos < state.order.length) return state.tracks[state.order[pos]]
  return state.repeat === 'all' && !state.isShuffled ? (state.tracks[0] ?? null) : null
}

/** What's coming, for the queue view: the listener's own queue, then the rest of the
 *  context in play order (up to `limit`). After a Back, the tracks stepped back past come
 *  first, since Next replays them. */
export function upcoming(state: QueueState, limit = 50) {
  const replay = state.timeline.slice(state.cursor + 1)
  const fromContext = state.order
    .slice(state.orderPos + 1, state.orderPos + 1 + limit)
    .map((i) => state.tracks[i])
  return { replay, upNext: state.upNext, fromContext }
}

/** The state after Back, or null at the start of the timeline (the player restarts the track). */
export function back(state: QueueState): QueueState | null {
  return state.cursor > 0 ? { ...state, cursor: state.cursor - 1 } : null
}

/** Play next: to the front of the listener's queue (in the order given). */
export const playNext = (state: QueueState, tracks: TrackSummary[]): QueueState => ({
  ...state,
  upNext: [...tracks, ...state.upNext],
})

/** Add to queue ("play last"): to the end of the listener's queue. */
export const addToQueue = (state: QueueState, tracks: TrackSummary[]): QueueState => ({
  ...state,
  upNext: [...state.upNext, ...tracks],
})

export const removeFromQueue = (state: QueueState, index: number): QueueState => ({
  ...state,
  upNext: state.upNext.filter((_, i) => i !== index),
})

/** Which part of the queue view a row is in (see upcoming()). */
export type QueueSection = 'replay' | 'upNext' | 'context'

/** Tapping a row in the queue view: play it now.
 *  - replay (stepped back past): forward along the timeline to it
 *  - upNext: it plays, and the queued tracks above it are dropped (they were skipped)
 *  - context: it plays, the context's tracks before it are passed over; your queue stays */
export function jumpTo(state: QueueState, section: QueueSection, index: number): QueueState {
  const { timeline, cursor } = state
  if (section === 'replay') {
    const at = cursor + 1 + index
    return at < timeline.length ? { ...state, cursor: at } : state
  }
  if (section === 'upNext') {
    const track = state.upNext[index]
    if (!track) return state
    const moved = withTimeline(state, [...timeline.slice(0, cursor + 1), track, ...timeline.slice(cursor + 1)], cursor + 1)
    return { ...moved, upNext: state.upNext.slice(index + 1) }
  }
  const pos = state.orderPos + 1 + index
  if (pos >= state.order.length) return state
  // A fresh path from here: anything stepped back past isn't coming back
  return withTimeline({ ...state, orderPos: pos }, [...timeline.slice(0, cursor + 1), state.tracks[state.order[pos]]], cursor + 1)
}

const move = <T,>(items: T[], from: number, to: number) => {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items
  const out = [...items]
  const [item] = out.splice(from, 1)
  out.splice(to, 0, item)
  return out
}

/** Drag within your own queue. */
export const moveInQueue = (state: QueueState, from: number, to: number): QueueState => ({
  ...state,
  upNext: move(state.upNext, from, to),
})

/** Drag within what's left of the context (its play order only; the album or playlist
 *  itself is untouched). Indices count from the next track, as upcoming() lists them. */
export function moveInContext(state: QueueState, from: number, to: number): QueueState {
  const start = state.orderPos + 1
  const rest = move(state.order.slice(start), from, to)
  return { ...state, order: [...state.order.slice(0, start), ...rest] }
}

/** Shuffle on: the rest of the context in a random order (what already played and the
 *  listener's queue stay put). Off: carry on in the context's own order from the current track. */
export function setShuffle(state: QueueState, isShuffled: boolean, random: Random = Math.random): QueueState {
  if (isShuffled === state.isShuffled) return state
  if (isShuffled) {
    const drawn = state.order.slice(0, state.orderPos + 1)
    const rest = state.order.slice(state.orderPos + 1)
    return { ...state, isShuffled, order: [...drawn, ...shuffled(rest, random)] }
  }
  const at = state.order[state.orderPos]
  return { ...state, isShuffled, order: identity(state.tracks.length), orderPos: at ?? -1 }
}

const REPEAT_CYCLE: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' }

export const cycleRepeat = (state: QueueState): QueueState => ({ ...state, repeat: REPEAT_CYCLE[state.repeat] })
