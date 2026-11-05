import { describe, expect, it } from 'vitest'
import type { PlaylistTrackEntry } from '@/lib/playlists'
import { trackSummary, userSummary } from '@/testing/fixtures'
import { comparePlaylistEntries, matchesEntry, parsePlaylistSort, type PlaylistSort } from './arrange-entries'

const entry = (id: string, name: string, owner: string, extra: Partial<PlaylistTrackEntry> = {}): PlaylistTrackEntry => ({
  trackId: id,
  name,
  duration: 180,
  addedAt: 1,
  unavailable: false,
  track: trackSummary(id, { name, owner: userSummary(owner, { displayName: owner === 'zed' ? 'Zed Ó Néill' : null }) }),
  ...extra,
})

const gone = (id: string, name: string, extra: Partial<PlaylistTrackEntry> = {}): PlaylistTrackEntry => ({
  trackId: id,
  name,
  duration: 60,
  addedAt: 1,
  unavailable: true,
  reason: 'DELETED',
  ...extra,
})

const ids = (entries: PlaylistTrackEntry[], sort: PlaylistSort) =>
  [...entries].sort(comparePlaylistEntries(sort)).map((e) => e.trackId)

describe('comparePlaylistEntries', () => {
  it("keeps the playlist's own order by default", () => {
    expect(comparePlaylistEntries('playlist')).toBeUndefined()
  })

  it('sorts by title, ignoring case and with numbers in number order', () => {
    const entries = [entry('a', 'track 10', 'x'), entry('b', 'Track 2', 'x'), entry('c', 'alpha', 'x')]
    expect(ids(entries, 'title')).toEqual(['c', 'b', 'a'])
  })

  it('puts the most recently added first', () => {
    const entries = [entry('old', 'A', 'x', { addedAt: 1 }), entry('new', 'B', 'x', { addedAt: 3 }), gone('mid', 'C', { addedAt: 2 })]
    expect(ids(entries, 'added')).toEqual(['new', 'mid', 'old'])
  })

  it('sorts by artist then title, placeholders last', () => {
    const entries = [gone('g', 'Aardvark'), entry('z', 'B', 'zed'), entry('m2', 'B', 'mo'), entry('m1', 'A', 'mo')]
    expect(ids(entries, 'artist')).toEqual(['m1', 'm2', 'z', 'g'])
  })

  it('sorts shortest first, ties by title', () => {
    const entries = [entry('long', 'A', 'x', { duration: 300 }), entry('b', 'B', 'x', { duration: 60 }), gone('a', 'A')]
    expect(ids(entries, 'length')).toEqual(['a', 'b', 'long'])
  })
})

describe('parsePlaylistSort', () => {
  it('falls back to the playlist order for anything unknown', () => {
    expect(parsePlaylistSort('title')).toBe('title')
    expect(parsePlaylistSort('nonsense')).toBe('playlist')
    expect(parsePlaylistSort('toString')).toBe('playlist')
    expect(parsePlaylistSort(null)).toBe('playlist')
  })
})

describe('matchesEntry', () => {
  const song = entry('s', 'Summer Demos', 'zed')

  it("matches the track name, the owner's name and their @username", () => {
    expect(matchesEntry(song, 'demos')).toBe(true)
    expect(matchesEntry(song, 'zed o neill')).toBe(true)
    expect(matchesEntry(song, '@zed')).toBe(true)
    expect(matchesEntry(song, 'winter')).toBe(false)
  })

  it('matches placeholders by their stored name', () => {
    expect(matchesEntry(gone('g', 'Old Demo'), 'old')).toBe(true)
  })
})
