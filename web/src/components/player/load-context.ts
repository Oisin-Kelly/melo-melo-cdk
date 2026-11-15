import { api } from '@/lib/api-client'
import { albumPath, playlistPath, profilePath, trackPath } from '@/lib/links'
import type { Playlist, PlaylistTrackEntry } from '@/lib/playlists'
import type { PaginatedResult, TrackSummary, UserSummary } from '@/types/api'
import { nameOf } from '@/types/user'
import type { PlayContext } from './queue'

type AlbumResponse = {
  album: { id: string; name: string; slug?: string | null; owner?: UserSummary }
  tracks: PaginatedResult<TrackSummary>
}
type PlaylistResponse = { playlist: Playlist; tracks: PaginatedResult<PlaylistTrackEntry> }

/** Every page of a cursor-paginated read, in order. */
async function everyPage<Page extends { tracks: PaginatedResult<unknown> }>(
  fetchPage: (cursor: string | null) => Promise<Page>,
): Promise<Page[]> {
  const pages: Page[] = []
  let cursor: string | null = null
  do {
    const page: Page = await fetchPage(cursor)
    pages.push(page)
    cursor = page.tracks.nextCursor
  } while (cursor)
  return pages
}

const withCursor = (path: string, cursor: string | null, extra = '') => {
  const params = [extra, cursor && `cursor=${encodeURIComponent(cursor)}`].filter(Boolean).join('&')
  return params ? `${path}?${params}` : path
}

/** An album, as something to play: its name, link and every track. */
export async function loadAlbum(albumId: string) {
  const pages = await everyPage((cursor) => api<AlbumResponse>(withCursor(`/albums/${albumId}`, cursor)))
  const { album } = pages[0]
  const tracks = pages.flatMap((page) => page.tracks.items)
  // Every track is the owner's, so a track's owner stands in if `owner` is missing
  const owner = album.owner ?? tracks[0]?.owner
  const context: PlayContext = {
    type: 'ALBUM',
    id: album.id,
    name: album.name,
    href: owner ? albumPath({ ...album, owner }) : `/albums/${album.id}`,
  }
  return { context, tracks }
}

/** A playlist (or Liked tracks): its name, link and every track still playable. */
export async function loadPlaylist(playlistId: string, me: string) {
  const pages = await everyPage((cursor) =>
    api<PlaylistResponse>(withCursor(`/playlists/${playlistId}`, cursor, 'limit=100')),
  )
  const { playlist } = pages[0]
  const tracks = pages.flatMap((page) =>
    page.tracks.items.flatMap((entry) => (entry.track && !entry.unavailable ? [entry.track] : [])),
  )
  const context: PlayContext = {
    type: 'PLAYLIST',
    id: playlist.id,
    name: playlist.type === 'LIKES' ? 'Liked tracks' : playlist.name,
    href: playlistPath(playlist, me),
  }
  return { context, tracks }
}

/** One track on its own. */
export const trackContext = (track: TrackSummary): PlayContext => ({
  type: 'TRACK',
  id: track.id,
  name: track.name,
  href: trackPath(track),
})

// ---- lists the app plays but the server can't reopen (Home, a profile's tracks) ----
// Their ids say how to rebuild them, so a resume point (contextType LIST) can.

type FeedType = 'ALL' | 'TRACK' | 'ALBUM'
type FeedSort = 'newest' | 'oldest'

/** Home's track cards, for that filter and sort. */
export const feedContext = (type: FeedType, sort: FeedSort): PlayContext => ({
  type: 'LIST',
  id: `feed:${type}:${sort}`,
  name: 'Home',
  href: '/',
})

/** The tracks someone shared with you, on their profile. */
export const sharedFromContext = (user: { username: string; displayName: string | null }): PlayContext => ({
  type: 'LIST',
  id: `shared-from:${user.username}`,
  name: `Shared by ${nameOf(user)}`,
  href: profilePath(user.username),
})

/** Your own tracks, on your profile. */
export const myTracksContext = (me: string): PlayContext => ({
  type: 'LIST',
  id: 'my-tracks',
  name: 'Your tracks',
  href: profilePath(me),
})

/** Pages of a list until `trackId` turns up, then one more for what comes after it (the
 *  list was only as long as had been scrolled into view, so this is about as much). */
async function pagesUntil<Item>(
  fetchPage: (cursor: string | null) => Promise<PaginatedResult<Item>>,
  toTrack: (item: Item) => TrackSummary | null | undefined,
  trackId: string,
): Promise<TrackSummary[]> {
  const MAX_PAGES = 20
  const tracks: TrackSummary[] = []
  let cursor: string | null = null
  let pagesAfter = -1
  for (let page = 0; page < MAX_PAGES && pagesAfter < 1; page++) {
    const result: PaginatedResult<Item> = await fetchPage(cursor)
    for (const item of result.items) {
      const track = toTrack(item)
      if (track) tracks.push(track)
    }
    if (pagesAfter >= 0) pagesAfter++
    else if (tracks.some((t) => t.id === trackId)) pagesAfter = 0
    cursor = result.nextCursor
    if (!cursor) break
  }
  return tracks
}

/** A LIST resume point's list, rebuilt from its id; null for one this app doesn't know. */
async function loadList(listId: string, trackId: string, me: string) {
  // The server stores ids lowercased
  const [kind, ...rest] = listId.split(':')
  if (kind === 'feed') {
    const type = rest[0]?.toUpperCase() as FeedType
    const sort: FeedSort = rest[1] === 'oldest' ? 'oldest' : 'newest'
    if (!['ALL', 'TRACK', 'ALBUM'].includes(type)) return null
    const tracks = await pagesUntil(
      (cursor) => {
        const params = new URLSearchParams()
        if (type !== 'ALL') params.set('type', type)
        if (sort === 'oldest') params.set('sort', 'asc')
        if (cursor) params.set('cursor', cursor)
        const qs = params.toString()
        return api<PaginatedResult<{ track?: TrackSummary }>>(`/feed${qs ? `?${qs}` : ''}`)
      },
      (entry) => entry.track,
      trackId,
    )
    return { context: feedContext(type, sort), tracks }
  }
  if (kind === 'shared-from' && rest[0]) {
    const username = rest.join(':')
    const tracks = await pagesUntil(
      (cursor) => api<PaginatedResult<{ track: TrackSummary }>>(withCursor(`/users/${encodeURIComponent(username)}/shared`, cursor)),
      (row) => row.track,
      trackId,
    )
    // Only a track's owner shares it, so any track stands in for whose list this is
    const owner = tracks[0]?.owner ?? { username, displayName: null }
    return { context: sharedFromContext(owner), tracks }
  }
  if (kind === 'my-tracks') {
    const tracks = await pagesUntil(
      (cursor) => api<PaginatedResult<TrackSummary>>(withCursor('/tracks', cursor, 'limit=20')),
      (track) => track,
      trackId,
    )
    return { context: myTracksContext(me), tracks }
  }
  return null
}

/** GET /me/progress: the single resume slot (204 = nothing to resume, or that track is
 *  gone or no longer shared). */
export type ResumePoint = {
  contextType: PlayContext['type']
  contextId: string
  trackId: string
  positionSeconds: number
  /** Epoch ms. */
  updatedAt: number
  track: TrackSummary
}

export async function fetchResumePoint() {
  return (await api<ResumePoint | undefined>('/me/progress')) ?? null
}

/** Reopen a saved resume point's context (just the track, when that can't be loaded or
 *  no longer has it). */
export async function loadResumeContext(
  resume: Pick<ResumePoint, 'contextType' | 'contextId' | 'track'>,
  me: string,
): Promise<{ context: PlayContext; tracks: TrackSummary[] }> {
  const alone = { context: trackContext(resume.track), tracks: [resume.track] }
  const load = () => {
    switch (resume.contextType) {
      case 'ALBUM':
        return loadAlbum(resume.contextId)
      case 'PLAYLIST':
        return loadPlaylist(resume.contextId, me)
      case 'LIST':
        return loadList(resume.contextId, resume.track.id, me)
      default:
        return null
    }
  }
  const loaded = await load()?.catch(() => null)
  // Gone (a deleted playlist), or the track has left it since: resume the track alone
  return loaded?.tracks.some((t) => t.id === resume.track.id) ? loaded : alone
}
