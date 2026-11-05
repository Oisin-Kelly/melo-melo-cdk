import { waitFor } from '@testing-library/react'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { describe, expect, it } from 'vitest'
import { albumSummary, trackSummary, userSummary } from '@/testing/fixtures'
import { renderHookWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { normalise } from '@/utils/search-text'
import { matchesQuery, useLibraryIndex, usePeopleSearch, type LibraryHit } from './search'

const empty = { items: [], nextCursor: null }

/** Serves every library source; `overrides` replaces individual paths. */
function serveLibrary(overrides: Record<string, (url: URL) => unknown> = {}) {
  const requests: string[] = []
  const sources: Record<string, (url: URL) => unknown> = {
    '/tracks/library': () => empty,
    '/albums': () => empty,
    '/albums/shared': () => empty,
    '/albums/liked': () => empty,
    '/playlists': () => empty,
    ...overrides,
  }
  for (const [path, body] of Object.entries(sources)) {
    server.use(
      http.get(`${API}${path}`, ({ request }) => {
        const url = new URL(request.url)
        requests.push(`${url.pathname}${url.search}`)
        return HttpResponse.json(body(url) as JsonBodyType)
      }),
    )
  }
  return requests
}

describe('matchesQuery', () => {
  const hit = { haystack: normalise('Summer Demos Oisín Kelly oisinkelly') } as LibraryHit

  it('needs every word, in any order, anywhere in the name/owner', () => {
    expect(matchesQuery(hit, 'demos summer')).toBe(true)
    expect(matchesQuery(hit, 'Oisin')).toBe(true)
    expect(matchesQuery(hit, 'summer winter')).toBe(false)
  })

  it('matches nothing for an empty query', () => {
    expect(matchesQuery(hit, '   ')).toBe(false)
  })
})

describe('useLibraryIndex', () => {
  it('fetches nothing until search is opened', async () => {
    const requests = serveLibrary()
    const { result } = renderHookWithProviders(() => useLibraryIndex(false))
    await new Promise((r) => setTimeout(r, 20))
    expect(requests).toEqual([])
    expect(result.current.hits).toEqual([])
  })

  it('pulls every source 100 at a time, following cursors to the end', async () => {
    const requests = serveLibrary({
      '/tracks/library': (url) =>
        url.searchParams.get('cursor')
          ? { items: [trackSummary('t2')], nextCursor: null }
          : { items: [trackSummary('t1')], nextCursor: 'next/1' },
    })

    const { result } = renderHookWithProviders(() => useLibraryIndex(true))

    await waitFor(() => expect(result.current.isComplete).toBe(true))
    expect(requests).toEqual(
      expect.arrayContaining([
        '/tracks/library?limit=100',
        '/tracks/library?limit=100&cursor=next%2F1',
        '/albums?limit=100',
        '/albums/shared?limit=100',
        '/albums/liked?limit=100',
        '/playlists?limit=100',
      ]),
    )
    expect(result.current.hits.map((h) => h.id)).toEqual(['t1', 't2'])
  })

  it('builds each hit with its readable URL, owner name and searchable text', async () => {
    serveLibrary({
      '/tracks/library': () => ({ items: [trackSummary('t1', { name: 'My Song', owner: userSummary('oisin', { displayName: 'Oisín' }), slug: 'my-song' })], nextCursor: null }),
      '/albums/shared': () => ({ items: [{ album: albumSummary('a1', { slug: 'summer' }) }], nextCursor: null }),
      '/playlists': () => ({
        items: [
          { id: 'likes', name: 'Likes', slug: null, imageUrl: null, imageBgColor: null },
          { id: 'p1', name: 'Road Trip', slug: 'road-trip', imageUrl: null, imageBgColor: null },
        ],
        nextCursor: null,
      }),
    })

    const { result } = renderHookWithProviders(() => useLibraryIndex(true), { username: 'me' })

    await waitFor(() => expect(result.current.isComplete).toBe(true))
    const byId = Object.fromEntries(result.current.hits.map((h) => [h.id, h]))
    expect(byId.t1).toMatchObject({ kind: 'TRACK', by: 'Oisín', href: '/oisin/my-song', haystack: 'my song oisin oisin' })
    expect(byId.a1).toMatchObject({ kind: 'ALBUM', href: '/owner/albums/summer' })
    expect(byId.likes).toMatchObject({ kind: 'PLAYLIST', href: '/liked' })
    expect(byId.p1).toMatchObject({ kind: 'PLAYLIST', href: '/me/playlists/road-trip', haystack: 'road trip' })
  })

  it('lists an item once even when several sources hold it', async () => {
    serveLibrary({
      '/albums': () => ({ items: [albumSummary('a1')], nextCursor: null }),
      '/albums/liked': () => ({ items: [albumSummary('a1')], nextCursor: null }),
    })

    const { result } = renderHookWithProviders(() => useLibraryIndex(true))

    await waitFor(() => expect(result.current.isComplete).toBe(true))
    expect(result.current.hits.map((h) => `${h.kind}:${h.id}`)).toEqual(['ALBUM:a1'])
  })

  it('is complete (with an error to retry) once every source has settled, even if one failed', async () => {
    serveLibrary()
    server.use(http.get(`${API}/albums/liked`, () => HttpResponse.json({}, { status: 500 })))

    const { result } = renderHookWithProviders(() => useLibraryIndex(true))

    await waitFor(() => expect(result.current.isComplete).toBe(true))
    expect(result.current.hasError).toBe(true)
  })

  it('is not complete while any source is still loading', async () => {
    serveLibrary()
    server.use(http.get(`${API}/playlists`, () => new Promise(() => {})))

    const { result } = renderHookWithProviders(() => useLibraryIndex(true))

    await new Promise((r) => setTimeout(r, 30))
    expect(result.current.isComplete).toBe(false)
  })
})

describe('usePeopleSearch', () => {
  it('searches the cleaned query, five at a time', async () => {
    let url: URL | undefined
    server.use(
      http.get(`${API}/users/search`, ({ request }) => {
        url = new URL(request.url)
        return HttpResponse.json({ items: [userSummary('oisin')], nextCursor: null })
      }),
    )

    const { result } = renderHookWithProviders(() => usePeopleSearch(' @OIS '))

    await waitFor(() => expect(result.current.data?.[0].username).toBe('oisin'))
    expect(url?.searchParams.get('q')).toBe('ois')
    expect(url?.searchParams.get('limit')).toBe('5')
  })

  it("doesn't search one character", async () => {
    const { result } = renderHookWithProviders(() => usePeopleSearch('o'))
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current.fetchStatus).toBe('idle')
  })
})
