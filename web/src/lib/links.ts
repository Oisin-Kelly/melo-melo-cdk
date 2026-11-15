import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { api, isNotFound } from './api-client'

// Readable URLs — every in-app link to a profile, track, album or playlist is built here:
//
//   /{username}                        profile        /{username}/followers | /following
//   /{username}/{slug}                 track          /{username}/{slug}/shared-with | /likes
//   /{username}/albums/{slug}          album
//   /{username}/playlists/{slug}       playlist (only ever the viewer's own)
//
// The ids stay the real identity: a slug URL resolves to an id (GET /users/{u}/slugs/…), then the
// page loads by id. Items made before slugs existed have no slug and link to their id route
// (/tracks/{id}…), which still works and moves to the readable URL once one exists.

export type SlugKind = 'tracks' | 'albums' | 'playlists'

type Owned = { id: string; slug?: string | null; owner: { username: string } }

// Every link built from list data remembers slug → id, so opening it from inside the app needs
// no resolve round trip (the resolve query starts from this). Only ever filled from data the API
// already returned to this viewer, so it reveals nothing the page couldn't load anyway.
const knownSlugs = new Map<string, string>()
const slugKey = (kind: SlugKind, owner: string, slug: string) => `${kind}/${owner}/${slug}`

function remember(kind: SlugKind, owner: string, slug: string, id: string) {
  knownSlugs.set(slugKey(kind, owner.toLowerCase(), slug), id)
}

export const profilePath = (username: string) => `/${username}`

export const followListPath = (username: string, kind: 'followers' | 'following') => `/${username}/${kind}`

export function trackPath(track: Owned): string {
  if (!track.slug) return `/tracks/${track.id}`
  remember('tracks', track.owner.username, track.slug, track.id)
  return `/${track.owner.username}/${track.slug}`
}

export const trackPeoplePath = (track: Owned, kind: 'shared-with' | 'likes') => `${trackPath(track)}/${kind}`

export const trackEditPath = (track: Owned) => `${trackPath(track)}/edit`

export function albumPath(album: Owned): string {
  if (!album.slug) return `/albums/${album.id}`
  remember('albums', album.owner.username, album.slug, album.id)
  return `/${album.owner.username}/albums/${album.slug}`
}

/** Playlists are private, so the owner is always the viewer. The likes playlist is /liked. */
export function playlistPath(playlist: { id: string; slug?: string | null }, me: string): string {
  if (playlist.id === 'likes') return '/liked'
  if (!playlist.slug) return `/playlists/${playlist.id}`
  remember('playlists', me, playlist.slug, playlist.id)
  return `/${me}/playlists/${playlist.slug}`
}

/** Item paths built from an activity row's target (absent slug → the id route). */
export function activityTargetPath(targetType: 'TRACK' | 'ALBUM', id: string, owner?: string, slug?: string) {
  const item = { id, slug, owner: { username: owner ?? '' } }
  return targetType === 'TRACK' ? trackPath(item) : albumPath(item)
}

/**
 * Resolves a readable URL to the item's id. 404 means no such URL, or one you can't see — the API
 * answers both the same way, on purpose. The page then loads by id and, if the URL it came in on
 * isn't the item's current one (an old slug, an id route), replaces it (see `useCanonicalPath`).
 */
export function useResolveSlug(kind: SlugKind, owner: string, slug: string) {
  const normalisedOwner = owner.toLowerCase()
  const normalisedSlug = slug.toLowerCase()
  const known = knownSlugs.get(slugKey(kind, normalisedOwner, normalisedSlug))
  return useQuery({
    queryKey: ['slugs', kind, normalisedOwner, normalisedSlug],
    queryFn: async () =>
      (
        await api<{ id: string; slug: string }>(
          `/users/${encodeURIComponent(normalisedOwner)}/slugs/${kind}/${encodeURIComponent(normalisedSlug)}`,
        )
      ).id,
    initialData: known,
    // A slug can be repointed (URL change, delete), so remembered ids aren't trusted forever
    staleTime: known ? 60_000 : 0,
    retry: (count, error) => !isNotFound(error) && count < 1,
  })
}

/**
 * Once a page has loaded its item, moves the address bar to the item's current URL — so an old id
 * link (/tracks/{id}), an old slug after a URL change, or odd casing all end up on the one readable
 * URL, without a history entry. Pass undefined while loading.
 */
export function useCanonicalPath(path: string | undefined) {
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    if (path && location.pathname !== path)
      void navigate(`${path}${location.search}${location.hash}`, { replace: true, state: location.state })
  }, [path, location.pathname, location.search, location.hash, location.state, navigate])
}
