import { act, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { albumSummary, trackSummary, userSummary } from '@/testing/fixtures'
import { renderHookWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { captureBodies, coverFile, serveStageUpload } from '@/testing/stage-upload'
import {
  albumDetailKey,
  useAlbumDetail,
  useAlbumRecipients,
  useAllMyAlbums,
  useCreateAlbum,
  useDeleteAlbum,
  useDeleteAlbums,
  useRemoveAlbumFromLibrary,
  useSetAlbumTracks,
  useShareAlbum,
  useShareAlbums,
  useUpdateAlbum,
} from './albums'

const album = { ...albumSummary('a1'), description: null }

describe('useAlbumDetail', () => {
  it('turns {album, tracks} into pages that each carry the album', async () => {
    const cursors: (string | null)[] = []
    server.use(
      http.get(`${API}/albums/a1`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        cursors.push(cursor)
        return HttpResponse.json({
          album,
          tracks: { items: [trackSummary(cursor ? 't2' : 't1')], nextCursor: cursor ? null : 'p2' },
        })
      }),
    )
    const { result } = renderHookWithProviders(() => useAlbumDetail('a1'))
    await waitFor(() => expect(result.current.hasNextPage).toBe(true))

    await act(() => result.current.fetchNextPage())

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
    expect(result.current.data?.pages[0]).toEqual({ album, items: [trackSummary('t1')], nextCursor: 'p2' })
    expect(result.current.data?.pages[1].items[0].id).toBe('t2')
    expect(cursors).toEqual([null, 'p2'])
  })

  it("doesn't retry a 404", async () => {
    let calls = 0
    server.use(
      http.get(`${API}/albums/gone`, () => {
        calls++
        return HttpResponse.json({}, { status: 404 })
      }),
    )
    const { result } = renderHookWithProviders(() => useAlbumDetail('gone'))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(calls).toBe(1)
  })
})

describe('useUpdateAlbum', () => {
  const details = { name: ' Summer ', description: '  ', cover: { file: null, clear: false } }

  it('trims, blanks → null, slug only when given', async () => {
    const bodies = captureBodies('put', '/albums/a1', album)
    const { result } = renderHookWithProviders(() => useUpdateAlbum('a1'))

    await act(() => result.current.mutateAsync(details))
    await act(() => result.current.mutateAsync({ ...details, slug: 'summer-demos' }))

    expect(bodies[0]).toEqual({ name: 'Summer', description: null, clearedImage: false })
    expect(bodies[1].slug).toBe('summer-demos')
  })

  it('stages a new cover under albums/, or clears the current one', async () => {
    serveStageUpload()
    const bodies = captureBodies('put', '/albums/a1', album)
    const { result } = renderHookWithProviders(() => useUpdateAlbum('a1'))

    await act(() => result.current.mutateAsync({ ...details, cover: { file: coverFile(), clear: true } }))
    await act(() => result.current.mutateAsync({ ...details, cover: { file: null, clear: true } }))

    expect(bodies[0]).toMatchObject({ imageKey: expect.stringMatching(/^me\/albums\/.+\.png$/), clearedImage: false })
    expect(bodies[1]).toMatchObject({ clearedImage: true })
  })

  it('refreshes every album list and the feed (name/cover show everywhere)', async () => {
    captureBodies('put', '/albums/a1', album)
    const { result, queryClient } = renderHookWithProviders(() => useUpdateAlbum('a1'))
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await act(() => result.current.mutateAsync(details))

    expect(invalidate.mock.calls.map(([f]) => f)).toEqual([{ queryKey: ['albums'] }, { queryKey: ['feed'] }, { predicate: expect.any(Function) }]) // + track pages' "In albums"
  })
})

describe('making an album and setting its tracks', () => {
  it('POSTs the trimmed details, a staged cover and the track ids, then refreshes album lists', async () => {
    serveStageUpload()
    const bodies = captureBodies('post', '/albums', album)
    const { result, queryClient } = renderHookWithProviders(() => useCreateAlbum())
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await act(() =>
      result.current.mutateAsync({ name: ' Summer ', description: ' ', cover: { file: coverFile(), clear: false }, trackIds: ['t2', 't1'] }),
    )

    expect(bodies).toEqual([
      { name: 'Summer', description: null, imageKey: expect.stringMatching(/^me\/albums\/.+\.png$/), trackIds: ['t2', 't1'] },
    ])
    expect(invalidate.mock.calls[0][0]).toEqual({ queryKey: ['albums'] })
  })

  it('PUTs the tracklist in order and refreshes the album, lists and feed', async () => {
    const bodies = captureBodies('put', '/albums/a1/tracks', { trackCount: 2, added: 0, removed: 0 })
    const { result, queryClient } = renderHookWithProviders(() => useSetAlbumTracks())
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await act(() => result.current.mutateAsync({ id: 'a1', trackIds: ['t2', 't1'] }))

    expect(bodies).toEqual([{ trackIds: ['t2', 't1'] }])
    expect(invalidate.mock.calls.map(([f]) => f)).toEqual([{ queryKey: ['albums'] }, { queryKey: ['feed'] }, { predicate: expect.any(Function) }])
  })
})

describe('sharing', () => {
  it('loads recipients only when enabled', async () => {
    server.use(http.get(`${API}/albums/a1/recipients`, () => HttpResponse.json({ items: [{ user: userSummary('bob'), sharedAt: 2 }] })))
    const off = renderHookWithProviders(() => useAlbumRecipients('a1', false))
    const on = renderHookWithProviders(() => useAlbumRecipients('a1', true))
    await waitFor(() => expect(on.result.current.data?.[0].user.username).toBe('bob'))
    expect(off.result.current.fetchStatus).toBe('idle')
  })

  it('posts the change with a trimmed caption and refreshes the album', async () => {
    const bodies = captureBodies('post', '/albums/a1/share', { sharedWith: ['bob'] })
    const { result, queryClient } = renderHookWithProviders(() => useShareAlbum('a1'))
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await act(() => result.current.mutateAsync({ add: ['bob'], remove: [], caption: ' hi ' }))

    expect(bodies).toEqual([{ add: ['bob'], remove: [], caption: 'hi' }])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: albumDetailKey('a1') })
  })
})

describe('leaving an album', () => {
  it.each([
    ['delete (owner)', () => useDeleteAlbum('a1'), '/albums/a1'],
    ['remove from my library (recipient)', () => useRemoveAlbumFromLibrary('a1'), '/albums/shared/a1'],
  ])('%s: DELETE %s, then refreshes lists but not the (departing) detail', async (_, hook, path) => {
    server.use(http.delete(`${API}${path}`, () => HttpResponse.json({})))
    const { result, queryClient } = renderHookWithProviders(hook)
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await act(() => result.current.mutateAsync())

    const filters = invalidate.mock.calls.map(([f]) => f as { queryKey: unknown[]; predicate?: (q: { queryKey: unknown[] }) => boolean })
    expect(filters.map((f) => f.queryKey)).toEqual([['feed'], ['albums'], ['playlists'], undefined]) // + track pages' "In albums"
    expect(filters[3].predicate!({ queryKey: ['tracks', 'detail', 't1', 'appears-in'] })).toBe(true)
    expect(filters[3].predicate!({ queryKey: ['tracks', 'detail', 't1'] })).toBe(false)
    expect(filters[1].predicate!({ queryKey: ['albums', 'detail', 'a1'] })).toBe(false)
    expect(filters[1].predicate!({ queryKey: ['albums', 'mine', 'list'] })).toBe(true)
  })
})

describe('the Your albums table', () => {
  it('loads every page of your albums, 100 at a time', async () => {
    const urls: string[] = []
    server.use(
      http.get(`${API}/albums`, ({ request }) => {
        const url = new URL(request.url)
        urls.push(url.search)
        const cursor = url.searchParams.get('cursor')
        return HttpResponse.json({ items: [albumSummary(cursor ? 'a2' : 'a1')], nextCursor: cursor ? null : 'p2' })
      }),
    )
    const { result } = renderHookWithProviders(() => useAllMyAlbums())
    await waitFor(() => expect(result.current.data?.map((a) => a.id)).toEqual(['a1', 'a2']))
    expect(urls).toEqual(['?limit=100', '?limit=100&cursor=p2'])
  })

  it('deletes each album, carries on past a failure and refreshes the lists', async () => {
    const deleted: string[] = []
    server.use(
      http.delete(`${API}/albums/:id`, ({ params }) => {
        if (params.id === 'a2') return HttpResponse.json({ statusCode: 500, message: 'x', error: 'x' }, { status: 500 })
        deleted.push(params.id as string)
        return HttpResponse.json({})
      }),
    )
    const { result, queryClient } = renderHookWithProviders(() => useDeleteAlbums())
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    const outcome = await act(() => result.current.mutateAsync(['a1', 'a2', 'a3']))

    expect(deleted.sort()).toEqual(['a1', 'a3'])
    expect(outcome.failed).toEqual(['a2'])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['feed'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['playlists'] })
  })

  it('shares each album with the same people and caption', async () => {
    const bodies: Record<string, unknown> = {}
    server.use(
      http.post(`${API}/albums/:id/share`, async ({ request, params }) => {
        bodies[params.id as string] = await request.json()
        return HttpResponse.json({ sharedWith: ['ada'] })
      }),
    )
    const { result } = renderHookWithProviders(() => useShareAlbums())
    await act(() => result.current.mutateAsync({ ids: ['a1', 'a2'], add: ['ada'], caption: ' hi ' }))
    expect(bodies).toEqual({
      a1: { add: ['ada'], remove: [], caption: 'hi' },
      a2: { add: ['ada'], remove: [], caption: 'hi' },
    })
  })
})
