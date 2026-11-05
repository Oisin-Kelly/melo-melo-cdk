import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { LocationProbe, renderWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import {
  AlbumIdRoute,
  AlbumSlugRoute,
  LikedRoute,
  OldProfileRedirect,
  PlaylistIdRoute,
  PlaylistSlugRoute,
  TrackIdRoute,
  TrackPeopleIdRoute,
  TrackPeopleSlugRoute,
  TrackSlugRoute,
} from './item-routes'

// The pages themselves are tested elsewhere; here they just show the id they were given
vi.mock('@/features/tracks/components/track-page', () => ({ TrackPage: ({ trackId }: { trackId: string }) => <p>Track {trackId}</p> }))
vi.mock('@/features/tracks/components/track-people-page', () => ({
  TrackPeoplePage: ({ trackId, kind }: { trackId: string; kind: string }) => <p>{`People ${kind} of ${trackId}`}</p>,
}))
vi.mock('@/features/albums/components/album-page', () => ({ AlbumPage: ({ albumId }: { albumId: string }) => <p>Album {albumId}</p> }))
vi.mock('@/features/playlists/components/playlist-page', () => ({
  PlaylistPage: ({ playlistId }: { playlistId: string }) => <p>Playlist {playlistId}</p>,
}))

function renderAt(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/tracks/:trackId" element={<TrackIdRoute />} />
      <Route path="/tracks/:trackId/likes" element={<TrackPeopleIdRoute kind="likes" />} />
      <Route path="/albums/:albumId" element={<AlbumIdRoute />} />
      <Route path="/playlists/:playlistId" element={<PlaylistIdRoute />} />
      <Route path="/liked" element={<LikedRoute />} />
      <Route path="/u/:username/*" element={<OldProfileRedirect />} />
      <Route path="/:username" element={<LocationProbe />} />
      <Route path="/:username/followers" element={<LocationProbe />} />
      <Route path="/:username/albums/:slug" element={<AlbumSlugRoute />} />
      <Route path="/:username/playlists/:slug" element={<PlaylistSlugRoute />} />
      <Route path="/:username/:slug" element={<TrackSlugRoute />} />
      <Route path="/:username/:slug/shared-with" element={<TrackPeopleSlugRoute kind="shared-with" />} />
    </Routes>,
    { route },
  )
}

let n = 0
const unique = (s: string) => `${s}-${++n}-${Date.now()}`

function serveSlug(kind: string, slug: string, id: string) {
  const asked: string[] = []
  server.use(
    http.get(`${API}/users/:user/slugs/:kind/:slug`, ({ params }) => {
      asked.push(`${params.user}/${params.kind}/${params.slug}`)
      return params.kind === kind && params.slug === slug
        ? HttpResponse.json({ id, slug })
        : HttpResponse.json({ statusCode: 404, message: "This isn't available", error: 'Not Found' }, { status: 404 })
    }),
  )
  return asked
}

describe('readable URLs', () => {
  it('resolves /{owner}/{slug} to the track and shows its page by id', async () => {
    const slug = unique('my-song')
    const asked = serveSlug('tracks', slug, 't1')
    renderAt(`/oisin/${slug}`)

    expect(await screen.findByText('Track t1')).toBeInTheDocument()
    expect(asked).toEqual([`oisin/tracks/${slug}`])
  })

  it.each([
    ['albums', '/oisin/albums/', 'Album a1', 'a1'],
    ['playlists', '/oisin/playlists/', 'Playlist p1', 'p1'],
  ])('resolves %s slugs too', async (kind, prefix, text, id) => {
    const slug = unique(kind)
    serveSlug(kind, slug, id)
    renderAt(`${prefix}${slug}`)
    expect(await screen.findByText(text)).toBeInTheDocument()
  })

  it("resolves a track's people pages", async () => {
    const slug = unique('song')
    serveSlug('tracks', slug, 't7')
    renderAt(`/oisin/${slug}/shared-with`)
    expect(await screen.findByText('People shared-with of t7')).toBeInTheDocument()
  })

  it.each([
    ['/oisin/', "This track isn't available"],
    ['/oisin/albums/', "This album isn't available"],
    ['/oisin/playlists/', "This playlist doesn't exist"],
  ])('a URL that resolves to nothing (%s…) gets the same screen as a missing item', async (prefix, title) => {
    serveSlug('none', 'none', 'x')
    renderAt(`${prefix}${unique('guess')}`)
    expect(await screen.findByText(title)).toBeInTheDocument()
  })

  it('offers a retry when the lookup fails for another reason', async () => {
    server.use(http.get(`${API}/users/:user/slugs/:kind/:slug`, () => HttpResponse.json({}, { status: 500 })))
    renderAt(`/oisin/${unique('song')}`)
    expect(await screen.findByText("Couldn't load this track")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('profile sub-routes win over track slugs', () => {
    renderAt('/oisin/followers')
    expect(screen.getByTestId('location')).toHaveTextContent('/oisin/followers')
  })
})

describe('old id URLs', () => {
  it.each([
    ['/tracks/t1', 'Track t1'],
    ['/tracks/t1/likes', 'People likes of t1'],
    ['/albums/a1', 'Album a1'],
    ['/playlists/p1', 'Playlist p1'],
  ])('%s still opens the page by id (it moves itself to the readable URL once loaded)', (route, text) => {
    renderAt(route)
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it.each([
    ['/u/oisin', '/oisin'],
    ['/u/oisin/followers', '/oisin/followers'],
  ])('%s moves to %s', async (from, to) => {
    renderAt(from)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(new RegExp(`^${to}$`)))
  })
})

describe('LikedRoute', () => {
  it('is the likes playlist', async () => {
    renderAt('/liked')
    expect(await screen.findByText('Playlist likes')).toBeInTheDocument()
  })

  it('sends old Liked-albums links to Library, where the albums now are', async () => {
    renderAt('/liked?tab=albums')
    expect(await screen.findByTestId('location')).toHaveTextContent('/library')
  })
})
