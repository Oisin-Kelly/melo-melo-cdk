import { act, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { sileo } from 'sileo'
import { describe, expect, it, vi } from 'vitest'
import { startDownload } from '@/lib/download'
import { trackSummary, userSummary } from '@/testing/fixtures'
import { createTestQueryClient, renderHookWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { captureBodies, coverFile, serveStageUpload } from '@/testing/stage-upload'

vi.mock('@/lib/download', () => ({ startDownload: vi.fn() }))
import {
  trackDetailKey,
  ORIGINAL_NOT_AVAILABLE,
  useDeleteTrack,
  useDownloadOriginal,
  useRemoveTrackFromLibrary,
  useShareTrack,
  useTrack,
  useTrackLikers,
  useTrackRecipients,
  useUpdateTrack,
  type Track,
} from './tracks'

const track = (extra: Partial<Track> = {}): Track => ({
  ...trackSummary('t1'),
  description: null,
  genre: null,
  ...extra,
})

describe('useTrack', () => {
  it("loads the track under ['tracks', 'detail', id]", async () => {
    server.use(http.get(`${API}/tracks/t1`, () => HttpResponse.json(track())))
    const { result, queryClient } = renderHookWithProviders(() => useTrack('t1'))
    await waitFor(() => expect(result.current.data?.id).toBe('t1'))
    expect(queryClient.getQueryData(trackDetailKey('t1'))).toEqual(result.current.data)
  })

  it("doesn't retry a 404 (deleted, or not shared with you), but retries other failures once", async () => {
    let missing = 0
    let flaky = 0
    server.use(
      http.get(`${API}/tracks/gone`, () => {
        missing++
        return HttpResponse.json({ statusCode: 404, message: 'x', error: 'Not Found' }, { status: 404 })
      }),
      http.get(`${API}/tracks/flaky`, () => {
        flaky++
        return HttpResponse.json({}, { status: 500 })
      }),
    )
    const a = renderHookWithProviders(() => useTrack('gone'))
    const b = renderHookWithProviders(() => useTrack('flaky'))
    await waitFor(() => expect(a.result.current.isError && b.result.current.isError).toBe(true))
    expect([missing, flaky]).toEqual([1, 2])
  })
})

describe('useUpdateTrack', () => {
  const edit = { name: '  New name ', genre: '  ', description: ' Words ', cover: null, clearCover: false }

  it('trims, sends blanks as null, and leaves the URL alone unless it changed', async () => {
    const bodies = captureBodies('put', '/tracks/t1', track({ name: 'New name' }))
    const { result } = renderHookWithProviders(() => useUpdateTrack('t1'))

    await act(() => result.current.mutateAsync(edit))

    expect(bodies[0]).toEqual({ name: 'New name', genre: null, description: 'Words', clearedImage: false })
    expect('slug' in bodies[0]).toBe(false)
  })

  it('sends a changed URL', async () => {
    const bodies = captureBodies('put', '/tracks/t1', track())
    const { result } = renderHookWithProviders(() => useUpdateTrack('t1'))

    await act(() => result.current.mutateAsync({ ...edit, slug: 'new-url' }))

    expect(bodies[0].slug).toBe('new-url')
  })

  it('stages a new cover (which wins over removing it)', async () => {
    serveStageUpload()
    const bodies = captureBodies('put', '/tracks/t1', track())
    const { result } = renderHookWithProviders(() => useUpdateTrack('t1'))

    await act(() => result.current.mutateAsync({ ...edit, cover: coverFile(), clearCover: true }))

    expect(bodies[0].imageKey).toMatch(/^me\/tracks\/.+\.png$/)
    expect(bodies[0].clearedImage).toBe(false)
  })

  it('removes the cover when asked', async () => {
    const bodies = captureBodies('put', '/tracks/t1', track())
    const { result } = renderHookWithProviders(() => useUpdateTrack('t1'))

    await act(() => result.current.mutateAsync({ ...edit, clearCover: true }))

    expect(bodies[0]).toMatchObject({ clearedImage: true })
  })

  it('caches the response as the detail and refreshes every list showing tracks (but no other detail)', async () => {
    const updated = track({ name: 'New name', slug: 'new-url' })
    captureBodies('put', '/tracks/t1', updated)
    const queryClient = createTestQueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHookWithProviders(() => useUpdateTrack('t1'), { queryClient })

    await act(() => result.current.mutateAsync(edit))

    expect(queryClient.getQueryData(trackDetailKey('t1'))).toEqual(updated)
    const filters = invalidate.mock.calls.map(([f]) => f as { queryKey: unknown[]; predicate?: (q: { queryKey: unknown[] }) => boolean })
    expect(filters.map((f) => f.queryKey)).toEqual([['tracks'], ['albums'], ['playlists'], ['feed'], ['users']])
    const tracksFilter = filters[0].predicate!
    expect(tracksFilter({ queryKey: ['tracks', 'mine', 'list'] })).toBe(true)
    expect(tracksFilter({ queryKey: ['tracks', 'detail', 't2'] })).toBe(false)
  })
})

describe('leaving a track', () => {
  it.each([
    ['delete (owner)', () => useDeleteTrack('t1'), '/tracks/t1'],
    ['remove from my library (recipient)', () => useRemoveTrackFromLibrary('t1'), '/tracks/shared/t1'],
  ])('%s: DELETE %s, then refreshes the lists', async (_, hook, path) => {
    let deleted = false
    server.use(
      http.delete(`${API}${path}`, () => {
        deleted = true
        return HttpResponse.json({})
      }),
    )
    const { result, queryClient } = renderHookWithProviders(hook)
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await act(() => result.current.mutateAsync())

    expect(deleted).toBe(true)
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['feed'] }))
  })
})

describe('sharing', () => {
  it('loads recipients only when enabled (owner), as the plain list', async () => {
    server.use(
      http.get(`${API}/tracks/t1/recipients`, () =>
        HttpResponse.json({ items: [{ user: userSummary('bob'), sharedAt: 1 }] }),
      ),
    )
    const off = renderHookWithProviders(() => useTrackRecipients('t1', false))
    const on = renderHookWithProviders(() => useTrackRecipients('t1', true))

    await waitFor(() => expect(on.result.current.data).toEqual([{ user: userSummary('bob'), sharedAt: 1 }]))
    expect(off.result.current.fetchStatus).toBe('idle')
  })

  it('posts adds, removes and a trimmed caption (blank → null), then refreshes the track', async () => {
    const bodies = captureBodies('post', '/tracks/t1/share', { sharedWith: ['bob'] })
    const { result, queryClient } = renderHookWithProviders(() => useShareTrack('t1'))
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await act(() => result.current.mutateAsync({ add: ['bob'], remove: ['eve'], caption: '  listen  ' }))
    await act(() => result.current.mutateAsync({ add: [], remove: ['bob'], caption: '   ' }))
    await act(() => result.current.mutateAsync({ add: ['bob'], remove: [] }))

    expect(bodies).toEqual([
      { add: ['bob'], remove: ['eve'], caption: 'listen' },
      { add: [], remove: ['bob'], caption: null },
      { add: ['bob'], remove: [], caption: null },
    ])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: trackDetailKey('t1') })
  })
})

describe('useTrackLikers', () => {
  it('pages who liked it, owner only', async () => {
    const urls: string[] = []
    server.use(
      http.get(`${API}/tracks/t1/likes`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        urls.push(cursor ?? '')
        return HttpResponse.json({ items: [{ user: userSummary('bob'), likedAt: 1 }], nextCursor: cursor ? null : 'p2' })
      }),
    )
    const { result } = renderHookWithProviders(() => useTrackLikers('t1', true))
    await waitFor(() => expect(result.current.hasNextPage).toBe(true))

    await act(() => result.current.fetchNextPage())

    await waitFor(() => expect(result.current.hasNextPage).toBe(false))
    expect(urls).toEqual(['', 'p2'])
  })
})

describe('useDownloadOriginal', () => {
  it('asks for the original and hands its URL to the browser to download', async () => {
    server.use(
      http.get(`${API}/tracks/t1/original`, () =>
        HttpResponse.json({ url: 'https://s3.test/original?sig', fileName: 'My Song.wav', contentType: 'audio/wav', expiresAt: 1 }),
      ),
    )
    const { result } = renderHookWithProviders(() => useDownloadOriginal('t1'))

    await act(() => result.current.mutateAsync())

    expect(startDownload).toHaveBeenCalledWith('https://s3.test/original?sig')
  })

  it("says so when the track has no original (or isn't yours)", async () => {
    server.use(
      http.get(`${API}/tracks/t1/original`, () =>
        HttpResponse.json({ statusCode: 404, message: ORIGINAL_NOT_AVAILABLE, error: 'Not Found' }, { status: 404 }),
      ),
    )
    const { result } = renderHookWithProviders(() => useDownloadOriginal('t1'))

    await act(() => result.current.mutateAsync().catch(() => {}))

    expect(startDownload).not.toHaveBeenCalled()
    expect(sileo.error).toHaveBeenCalledWith({ title: ORIGINAL_NOT_AVAILABLE })
  })

  it('shows a retry message for anything else', async () => {
    server.use(http.get(`${API}/tracks/t1/original`, () => HttpResponse.json({}, { status: 500 })))
    const { result } = renderHookWithProviders(() => useDownloadOriginal('t1'))

    await act(() => result.current.mutateAsync().catch(() => {}))

    expect(startDownload).not.toHaveBeenCalled()
    expect(sileo.error).toHaveBeenCalledWith({ title: "Couldn't download the original", description: 'Please try again.' })
  })
})
