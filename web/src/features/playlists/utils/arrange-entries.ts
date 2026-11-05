import type { PlaylistTrackEntry } from '@/lib/playlists'
import { nameOf } from '@/types/user'
import { matchesWords, normalise } from '@/utils/search-text'

// Searching and sorting a playlist on the page. Display only: the saved order is
// untouched. Placeholders (deleted / no longer shared) use their stored name + length.

export type PlaylistSort = 'playlist' | 'added' | 'title' | 'artist' | 'length'

export const PLAYLIST_SORT_OPTIONS: Record<PlaylistSort, string> = {
  playlist: 'Playlist order',
  added: 'Recently added',
  title: 'Title',
  artist: 'Artist',
  length: 'Length',
}

// The likes playlist's own order already is newest like first, so it's named for that
// and there's no separate "Recently added"
export type LikesSort = Exclude<PlaylistSort, 'added'>

export const LIKES_SORT_OPTIONS: Record<LikesSort, string> = {
  playlist: 'Recently liked',
  title: 'Title',
  artist: 'Artist',
  length: 'Length',
}

export function parsePlaylistSort(value: string | null): PlaylistSort {
  return value && Object.hasOwn(PLAYLIST_SORT_OPTIONS, value) ? (value as PlaylistSort) : 'playlist'
}

const compareText = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })

const artistOf = (entry: PlaylistTrackEntry) => (entry.track ? nameOf(entry.track.owner) : null)

const byTitle = (a: PlaylistTrackEntry, b: PlaylistTrackEntry) => compareText(a.name, b.name)

/** The comparator for a sort, or undefined for the playlist's own order. Ties fall back to the title. */
export function comparePlaylistEntries(
  sort: PlaylistSort,
): ((a: PlaylistTrackEntry, b: PlaylistTrackEntry) => number) | undefined {
  switch (sort) {
    case 'playlist':
      return undefined
    case 'added':
      return (a, b) => b.addedAt - a.addedAt || byTitle(a, b)
    case 'title':
      return byTitle
    case 'artist':
      // Placeholders have no owner any more: they go last
      return (a, b) => {
        const artistA = artistOf(a)
        const artistB = artistOf(b)
        if (artistA === null || artistB === null) return (artistA === null ? 1 : 0) - (artistB === null ? 1 : 0) || byTitle(a, b)
        return compareText(artistA, artistB) || byTitle(a, b)
      }
    case 'length':
      return (a, b) => a.duration - b.duration || byTitle(a, b)
  }
}

/** Every word of the query is in the track's name or its owner's name / @username. */
export function matchesEntry(entry: PlaylistTrackEntry, query: string): boolean {
  const owner = entry.track?.owner
  const haystack = normalise(owner ? `${entry.name} ${nameOf(owner)} ${owner.username}` : entry.name)
  return matchesWords(haystack, query.replace(/(^|\s)@/g, '$1'))
}
