import { api } from '@/lib/api-client'
import { albumPath, playlistPath, trackPath } from '@/lib/links'
import type { Playlist, PlaylistTrackEntry } from '@/lib/playlists'
import type { PaginatedResult, TrackSummary, UserSummary } from '@/types/api'
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

/** GET /me/progress: the single resume slot (204 = nothing to resume, or that track is
 *  gone or no longer shared). */
export type ResumePoint = {
  contextType: 'TRACK' | 'ALBUM' | 'PLAYLIST'
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

/** Reopen a saved resume point's context. */
export function loadResumeContext(resume: Pick<ResumePoint, 'contextType' | 'contextId' | 'track'>, me: string) {
  switch (resume.contextType) {
    case 'ALBUM':
      return loadAlbum(resume.contextId)
    case 'PLAYLIST':
      return loadPlaylist(resume.contextId, me)
    default:
      return Promise.resolve({ context: trackContext(resume.track), tracks: [resume.track] })
  }
}
