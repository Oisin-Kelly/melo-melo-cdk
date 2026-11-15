import { describe, expect, it } from 'vitest'
import { trackSummary } from '@/testing/fixtures'
import {
  addToQueue,
  back,
  currentTrack,
  cycleRepeat,
  emptyQueue,
  next,
  peekNext,
  playNext,
  removeFromQueue,
  setShuffle,
  shuffled,
  start,
  TIMELINE_LIMIT,
  upcoming,
  jumpTo,
  moveInContext,
  moveInQueue,
  type QueueState,
} from './queue'

const album = { type: 'ALBUM' as const, id: 'al1', name: 'Album', href: '/bob/albums/album' }
const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id) => trackSummary(id))
// A "random" that always picks the last candidate: Fisher–Yates then leaves the order as is
const keep = () => 0.999
// One that always picks the first: reverses the list
const reverse = () => 0

const ids = (tracks: { id: string }[]) => tracks.map((t) => t.id)
const now = (state: QueueState | null) => (state ? currentTrack(state)?.id : null)

/** Press Next `times` times; null once it runs out. */
function skip(state: QueueState, times = 1) {
  let s: QueueState | null = state
  for (let i = 0; i < times && s; i++) s = next(s)
  return s
}

describe('queue', () => {
  it('plays a context from the track pressed, then on to its end, then stops', () => {
    const q = start(emptyQueue, album, [a, b, c], 1)
    expect(now(q)).toBe('b')
    expect(now(skip(q))).toBe('c')
    expect(skip(q, 2)).toBeNull()
  })

  it('Play next goes before the rest; Back then Next replays it, then the context carries on', () => {
    // Playing A, B is next in the album; Q is added with Play next
    const q = playNext(start(emptyQueue, album, [a, b, c]), [d])
    const onQ = next(q)!
    expect(now(onQ)).toBe('d')
    const backOnA = back(onQ)!
    expect(now(backOnA)).toBe('a')
    const qAgain = next(backOnA)!
    expect(now(qAgain)).toBe('d')
    expect(now(next(qAgain))).toBe('b')
  })

  it('Play next adds in front of the queue, Add to queue after it', () => {
    let q = start(emptyQueue, album, [a])
    q = addToQueue(q, [b])
    q = addToQueue(q, [c])
    q = playNext(q, [d])
    expect(ids(q.upNext)).toEqual(['d', 'b', 'c'])
    expect(ids(removeFromQueue(q, 1).upNext)).toEqual(['d', 'c'])
  })

  it('a newly queued track still plays next after going Back', () => {
    const q = start(emptyQueue, album, [a, b, c])
    const backOnA = back(next(q)!)!
    expect(now(next(playNext(backOnA, [d])))).toBe('d')
  })

  it('started mid-list, Back walks up the list from there and Next comes forward again', () => {
    const state = start(emptyQueue, album, [a, b, c, d], 2)
    expect(now(state)).toBe('c')
    expect(ids(upcoming(state).fromContext)).toEqual(['d'])
    const up = back(state)!
    expect(now(up)).toBe('b')
    // The queue view: c again, then the rest of the list, nothing twice
    expect(ids(upcoming(up).replay)).toEqual(['c'])
    expect(ids(upcoming(up).fromContext)).toEqual(['d'])
    expect(now(back(up))).toBe('a')
    expect(back(back(up)!)).toBeNull()
    expect(now(skip(up, 2))).toBe('d')
    expect(skip(up, 3)).toBeNull()
  })

  it('started mid-list while shuffled, Back has nothing above it', () => {
    const state = start(setShuffle(emptyQueue, true), album, [a, b, c, d], 2, keep)
    expect(back(state)).toBeNull()
  })

  it('Back at the first track has nowhere to go (the player restarts it)', () => {
    expect(back(start(emptyQueue, album, [a, b]))).toBeNull()
  })

  it('repeat all goes round again; repeat one leaves Next alone', () => {
    const all = cycleRepeat(start(emptyQueue, album, [a, b]))
    expect(all.repeat).toBe('all')
    expect(now(skip(all, 2))).toBe('a')
    const one = cycleRepeat(all)
    expect(one.repeat).toBe('one')
    expect(skip(one, 2)).toBeNull()
    expect(cycleRepeat(one).repeat).toBe('off')
  })

  it('shuffled, the track pressed plays first and every other track once', () => {
    const q = start({ ...emptyQueue, isShuffled: true }, album, [a, b, c, d], 2, reverse)
    expect(now(q)).toBe('c')
    const played = [now(q)]
    let s: QueueState | null = q
    while ((s = next(s!))) played.push(now(s))
    expect(played).toHaveLength(4)
    expect(new Set(played)).toEqual(new Set(['a', 'b', 'c', 'd']))
  })

  it('shuffle on mixes only what has yet to play; off carries on from the current track', () => {
    const onB = next(start(emptyQueue, album, [a, b, c, d]))!
    const mixed = setShuffle(onB, true, reverse)
    expect(now(mixed)).toBe('b')
    expect(now(next(mixed))).toBe('d')
    const plain = setShuffle(next(mixed)!, false)
    // Now on D (the album's last): nothing after it in the album's own order
    expect(next(plain)).toBeNull()
  })

  it('peeks at what Next will play without moving', () => {
    const q = start(emptyQueue, album, [a, b])
    expect(peekNext(q)?.id).toBe('b')
    expect(peekNext(playNext(q, [d]))?.id).toBe('d')
    expect(peekNext(next(q)!)).toBeNull()
    expect(peekNext(cycleRepeat(next(q)!))?.id).toBe('a')
    expect(now(q)).toBe('a')
  })

  it('keeps the queue, shuffle and repeat when something else is played', () => {
    const before = cycleRepeat(addToQueue(start(emptyQueue, album, [a]), [d]))
    const after = start(before, { type: 'TRACK', id: 'c', name: 'C', href: '/bob/c' }, [c])
    expect(now(after)).toBe('c')
    expect(ids(after.upNext)).toEqual(['d'])
    expect(after.repeat).toBe('all')
  })

  it("doesn't let the timeline grow forever", () => {
    const many = Array.from({ length: TIMELINE_LIMIT + 5 }, (_, i) => trackSummary(`t${i}`))
    const end = skip(start(emptyQueue, album, many), TIMELINE_LIMIT + 4)!
    expect(end.timeline).toHaveLength(TIMELINE_LIMIT)
    expect(now(end)).toBe(`t${TIMELINE_LIMIT + 4}`)
  })

  it('ignores an empty context', () => {
    expect(start(emptyQueue, album, [])).toBe(emptyQueue)
  })

  it('shuffles in place with the given randomness', () => {
    expect(shuffled([1, 2, 3], keep)).toEqual([1, 2, 3])
    expect(shuffled([1, 2, 3], reverse)).toEqual([2, 3, 1])
  })

  it('lists what’s coming: the replay after a Back, your queue, then the rest of the context', () => {
    const onB = next(start(emptyQueue, album, [a, b, c]))!
    const backOnA = playNext(back(onB)!, [d])
    expect(upcoming(backOnA)).toEqual({ replay: [b], upNext: [d], fromContext: [c] })
  })

  it('jumping to a queued track plays it and drops the queued tracks above it', () => {
    const q = addToQueue(start(emptyQueue, album, [a, b]), [c, d])
    const onD = jumpTo(q, 'upNext', 1)
    expect(now(onD)).toBe('d')
    expect(onD.upNext).toEqual([])
    // Then the context carries on where it was
    expect(now(next(onD))).toBe('b')
    expect(now(back(onD))).toBe('a')
  })

  it('jumping into the context passes over the tracks before it, keeping your queue', () => {
    const q = addToQueue(start(emptyQueue, album, [a, b, c, d]), [d])
    const onC = jumpTo(q, 'context', 1)
    expect(now(onC)).toBe('c')
    expect(ids(onC.upNext)).toEqual(['d'])
    expect(now(next(next(onC)!))).toBe('d') // your queue, then the album's d
    expect(upcoming(onC).fromContext.map((t) => t.id)).toEqual(['d'])
  })

  it('jumping to a track stepped back past moves forward to it', () => {
    const onC = skip(start(emptyQueue, album, [a, b, c]), 2)!
    const onA = back(back(onC)!)!
    expect(now(jumpTo(onA, 'replay', 1))).toBe('c')
  })

  it('moves tracks within your queue, and within what’s left of the context', () => {
    const q = addToQueue(start(emptyQueue, album, [a, b, c, d]), [a, b, c])
    expect(ids(moveInQueue(q, 2, 0).upNext)).toEqual(['c', 'a', 'b'])
    const moved = moveInContext(q, 2, 0)
    expect(upcoming(moved).fromContext.map((t) => t.id)).toEqual(['d', 'b', 'c'])
    // The album's own order is untouched
    expect(ids(moved.tracks)).toEqual(['a', 'b', 'c', 'd'])
    expect(moveInQueue(q, 0, 9)).toEqual(q)
  })
})
