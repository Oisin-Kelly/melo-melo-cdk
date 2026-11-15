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
  useDeleteAlbum,
  useRemoveAlbumFromLibrary,
  useShareAlbum,
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
