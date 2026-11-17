import type { ReactNode } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router'
import { PageLoader } from '@/components/feedback/page-loader'
import { UnavailableScreen } from '@/components/feedback/unavailable-screen'
import { AlbumPage } from '@/features/albums/components/album-page'
import { PlaylistPage } from '@/features/playlists/components/playlist-page'
import { TrackPage } from '@/features/tracks/components/track-page'
import { TrackPeoplePage, type TrackPeopleKind } from '@/features/tracks/components/track-people-page'
import { isNotFound } from '@/lib/api-client'
import { useResolveSlug, type SlugKind } from '@/lib/links'

// Track, album and playlist pages load by id. Their readable URLs (/{owner}/{slug},
// /{owner}/albums/{slug}, /{owner}/playlists/{slug}) resolve the slug to that id first; the old
// id routes (/tracks/{id}, …) pass it straight through. Either way the page then moves the
// address bar to the item's current URL (useCanonicalPath).

const WHAT = { tracks: 'track', albums: 'album', playlists: 'playlist' } as const

function SlugRoute({ kind, children }: { kind: SlugKind; children: (id: string) => ReactNode }) {
  const { username = '', slug = '' } = useParams()
  const resolved = useResolveSlug(kind, username, slug)

  if (resolved.isPending) return <PageLoader what={WHAT[kind]} />
  if (resolved.isError)
    return (
      <UnavailableScreen what={WHAT[kind]} isMissing={isNotFound(resolved.error)} onRetry={() => void resolved.refetch()} />
    )
  return children(resolved.data)
}

// `key` remounts the page when the same route moves to another item (no stale local state)
export const TrackSlugRoute = () => <SlugRoute kind="tracks">{(id) => <TrackPage key={id} trackId={id} />}</SlugRoute>

export const TrackPeopleSlugRoute = ({ kind }: { kind: TrackPeopleKind }) => (
  <SlugRoute kind="tracks">{(id) => <TrackPeoplePage key={id} trackId={id} kind={kind} />}</SlugRoute>
)

export const TrackEditSlugRoute = () => (
  <SlugRoute kind="tracks">{(id) => <TrackPage key={id} trackId={id} isEditing />}</SlugRoute>
)

export const AlbumSlugRoute = () => <SlugRoute kind="albums">{(id) => <AlbumPage key={id} albumId={id} />}</SlugRoute>

export const PlaylistSlugRoute = () => (
  <SlugRoute kind="playlists">{(id) => <PlaylistPage key={id} playlistId={id} />}</SlugRoute>
)

// ---- Old id routes: still work (shared links, items without a slug yet) ----

export function TrackIdRoute() {
  const { trackId = '' } = useParams()
  return <TrackPage key={trackId} trackId={trackId} />
}

export function TrackPeopleIdRoute({ kind }: { kind: TrackPeopleKind }) {
  const { trackId = '' } = useParams()
  return <TrackPeoplePage key={trackId} trackId={trackId} kind={kind} />
}

export function TrackEditIdRoute() {
  const { trackId = '' } = useParams()
  return <TrackPage key={trackId} trackId={trackId} isEditing />
}

export function AlbumIdRoute() {
  const { albumId = '' } = useParams()
  return <AlbumPage key={albumId} albumId={albumId} />
}

export function PlaylistIdRoute() {
  const { playlistId = '' } = useParams()
  return <PlaylistPage key={playlistId} playlistId={playlistId} />
}

/** Liked tracks. Old Liked-albums links (/liked?tab=albums) go to their shelf in Library. */
export function LikedRoute() {
  const [params] = useSearchParams()
  if (params.get('tab') === 'albums') return <Navigate to="/library" replace />
  return <PlaylistPage playlistId="likes" />
}

/** Profiles moved from /u/{username}… to /{username}…. */
export function OldProfileRedirect() {
  const { username = '', '*': rest = '' } = useParams()
  return <Navigate to={`/${username}${rest ? `/${rest}` : ''}`} replace />
}
