import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Route, Routes, useNavigate } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { LocationProbe, renderHookWithProviders, renderWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import {
  activityTargetPath,
  albumPath,
  followListPath,
  playlistPath,
  profilePath,
  trackPath,
  trackPeoplePath,
  useCanonicalPath,
  useResolveSlug,
} from './links'

// links.ts remembers slug → id in a module-level map, so every test uses its own slugs
let n = 0
const unique = (name: string) => `${name}-${++n}-${Date.now()}`

const owner = { username: 'oisin' }

describe('path builders', () => {
  it('profiles and follow lists live at the root', () => {
    expect(profilePath('oisin')).toBe('/oisin')
    expect(followListPath('oisin', 'followers')).toBe('/oisin/followers')
    expect(followListPath('oisin', 'following')).toBe('/oisin/following')
  })

  it('tracks: /{owner}/{slug}, people pages under it, the id route without a slug', () => {
    const track = { id: 't1', slug: 'my-song', owner }
    expect(trackPath(track)).toBe('/oisin/my-song')
    expect(trackPeoplePath(track, 'likes')).toBe('/oisin/my-song/likes')
    expect(trackPeoplePath(track, 'shared-with')).toBe('/oisin/my-song/shared-with')
    expect(trackPath({ id: 't1', slug: null, owner })).toBe('/tracks/t1')
    expect(trackPath({ id: 't1', owner })).toBe('/tracks/t1')
    expect(trackPeoplePath({ id: 't1', owner }, 'likes')).toBe('/tracks/t1/likes')
  })

  it('albums: /{owner}/albums/{slug}, else the id route', () => {
    expect(albumPath({ id: 'a1', slug: 'summer', owner })).toBe('/oisin/albums/summer')
    expect(albumPath({ id: 'a1', owner })).toBe('/albums/a1')
  })

  it("playlists: under the viewer's name; likes is /liked; else the id route", () => {
    expect(playlistPath({ id: 'p1', slug: 'road-trip' }, 'me')).toBe('/me/playlists/road-trip')
    expect(playlistPath({ id: 'likes', slug: null }, 'me')).toBe('/liked')
    expect(playlistPath({ id: 'p1' }, 'me')).toBe('/playlists/p1')
  })

  it("activity targets use the target's owner and slug, falling back to the id route", () => {
    expect(activityTargetPath('TRACK', 't1', 'oisin', 'my-song')).toBe('/oisin/my-song')
    expect(activityTargetPath('ALBUM', 'a1', 'oisin', 'summer')).toBe('/oisin/albums/summer')
    expect(activityTargetPath('TRACK', 't1')).toBe('/tracks/t1')
    expect(activityTargetPath('ALBUM', 'a1', 'oisin')).toBe('/albums/a1')
  })
})

describe('useResolveSlug', () => {
  it('asks the API (lowercased) for a slug it has not seen', async () => {
    const slug = unique('song')
    const requests: string[] = []
    server.use(
      http.get(`${API}/users/:user/slugs/:kind/:slug`, ({ request, params }) => {
        requests.push(new URL(request.url).pathname)
        return HttpResponse.json({ id: 't9', slug: params.slug })
      }),
    )

    const { result } = renderHookWithProviders(() => useResolveSlug('tracks', 'Oisin', slug.toUpperCase()))

    await waitFor(() => expect(result.current.data).toBe('t9'))
    expect(requests).toEqual([`/users/oisin/slugs/tracks/${slug}`])
  })

  it('needs no request for a link the app already built', async () => {
    const slug = unique('album')
    albumPath({ id: 'a42', slug, owner })
    const onRequest = vi.fn()
    server.events.on('request:start', onRequest)

    const { result } = renderHookWithProviders(() => useResolveSlug('albums', 'oisin', slug))

    expect(result.current.data).toBe('a42')
    expect(result.current.isSuccess).toBe(true)
    await new Promise((r) => setTimeout(r, 20))
    expect(onRequest).not.toHaveBeenCalled()
    server.events.removeListener('request:start', onRequest)
  })

  it('reports a 404 without retrying (missing and no-access look the same)', async () => {
    const slug = unique('nope')
    let calls = 0
    server.use(
      http.get(`${API}/users/:user/slugs/:kind/:slug`, () => {
        calls++
        return HttpResponse.json(
          { statusCode: 404, message: "This isn't available", error: 'Not Found' },
          { status: 404 },
        )
      }),
    )

    const { result } = renderHookWithProviders(() => useResolveSlug('playlists', 'oisin', slug))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ status: 404 })
    expect(calls).toBe(1)
  })
})

describe('useCanonicalPath', () => {
  function Page({ path }: { path?: string }) {
    useCanonicalPath(path)
    return <LocationProbe />
  }

  it('replaces the address with the canonical one, keeping the query and hash, without a new entry', async () => {
    function Back() {
      const navigate = useNavigate()
      return <button onClick={() => void navigate(-1)}>back</button>
    }
    renderWithProviders(
      <Routes>
        <Route path="/start" element={<Back />} />
        <Route
          path="*"
          element={
            <>
              <Page path="/oisin/my-song" />
              <Back />
            </>
          }
        />
      </Routes>,
      { route: ['/start', '/tracks/t1?play=1#top'] },
    )

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/oisin/my-song?play=1#top'))
    // replace, not push: going back lands on /start (only a Back button, no probe). A push would
    // land on the old /tracks/t1 entry instead, which redirects again and shows the probe
    screen.getByRole('button', { name: 'back' }).click()
    await waitFor(() => expect(screen.queryByTestId('location')).not.toBeInTheDocument())
  })

  it('does nothing while loading or when already there', async () => {
    const { rerender } = renderWithProviders(<Page />, { route: '/tracks/t1' })
    expect(screen.getByTestId('location')).toHaveTextContent('/tracks/t1')

    rerender(<Page path="/tracks/t1" />)
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.getByTestId('location')).toHaveTextContent('/tracks/t1')
  })
})
