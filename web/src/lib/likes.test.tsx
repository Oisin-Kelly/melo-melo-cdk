import { act, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { sileo } from 'sileo'
import { describe, expect, it, vi } from 'vitest'
import { albumSummary, pages, trackSummary } from '@/testing/fixtures'
import { createTestQueryClient, renderHookWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { useToggleLike } from './likes'

type Row = { id: string; likedByMe: boolean }
type CachedPages = { pages: { items: unknown[]; album?: Row }[] }

function seededClient() {
  const queryClient = createTestQueryClient()
  // Every shape a heart can sit in:
  queryClient.setQueryData(['tracks', 'mine', 'list'], pages([trackSummary('t1'), trackSummary('t2')])) // bare rows
  queryClient.setQueryData(['feed', 'ALL', 'newest'], pages([{ type: 'TRACK', track: trackSummary('t1') }, { type: 'ALBUM', album: albumSummary('a1') }])) // wrapped
  queryClient.setQueryData(['albums', 'detail', 'a1'], {
    pages: [{ items: [trackSummary('t1')], nextCursor: null, album: albumSummary('a1') }], // page.album beside its tracks
    pageParams: [null],
  })
  queryClient.setQueryData(['tracks', 'detail', 't1'], trackSummary('t1')) // the track page
  queryClient.setQueryData(['something', 'else'], { notPages: true }) // untouched
  return queryClient
}

const liked = (queryClient: ReturnType<typeof createTestQueryClient>) => ({
  bare: (queryClient.getQueryData<CachedPages>(['tracks', 'mine', 'list'])!.pages[0].items as Row[]).map((r) => r.likedByMe),
  feed: queryClient.getQueryData<CachedPages>(['feed', 'ALL', 'newest'])!.pages[0].items.map((e) => {
    const entry = e as { track?: Row; album?: Row }
    return (entry.track ?? entry.album)!.likedByMe
  }),
  albumHeader: queryClient.getQueryData<CachedPages>(['albums', 'detail', 'a1'])!.pages[0].album!.likedByMe,
  albumTrack: (queryClient.getQueryData<CachedPages>(['albums', 'detail', 'a1'])!.pages[0].items[0] as Row).likedByMe,
  detail: queryClient.getQueryData<Row>(['tracks', 'detail', 't1'])!.likedByMe,
})

describe('useToggleLike', () => {
  it('posts the new value and flips the track in every cached shape at once', async () => {
    let body: unknown
    let release!: () => void
    server.use(
      http.post(`${API}/tracks/t1/like`, async ({ request }) => {
        body = await request.json()
        await new Promise<void>((r) => (release = r))
        return HttpResponse.json({ newValue: true })
      }),
    )
    const queryClient = seededClient()
    const { result } = renderHookWithProviders(() => useToggleLike(), { queryClient })

    act(() => result.current.mutate({ kind: 'TRACK', id: 't1', liked: true }))

    // Optimistic: flipped before the server answers; other items untouched
    await waitFor(() => expect(liked(queryClient)).toEqual({ bare: [true, false], feed: [true, false], albumHeader: false, albumTrack: true, detail: true }))
    expect(queryClient.getQueryData(['something', 'else'])).toEqual({ notPages: true })

    release()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(body).toEqual({ newValue: true })
  })

  it('likes an album through /albums/{id}/like, flipping its rows and the album page header', async () => {
    server.use(http.post(`${API}/albums/a1/like`, () => HttpResponse.json({ newValue: true })))
    const queryClient = seededClient()
    const { result } = renderHookWithProviders(() => useToggleLike(), { queryClient })

    await act(() => result.current.mutateAsync({ kind: 'ALBUM', id: 'a1', liked: true }))

    expect(liked(queryClient)).toMatchObject({ feed: [false, true], albumHeader: true, detail: false })
  })

  it('rolls every copy back and says so when the request fails', async () => {
    server.use(http.post(`${API}/tracks/t1/like`, () => HttpResponse.json({}, { status: 500 })))
    const queryClient = seededClient()
    const before = liked(queryClient)
    const { result } = renderHookWithProviders(() => useToggleLike(), { queryClient })

    await act(() => result.current.mutateAsync({ kind: 'TRACK', id: 't1', liked: true }).catch(() => {}))

    expect(liked(queryClient)).toEqual(before)
    expect(sileo.error).toHaveBeenCalledWith({ title: "Couldn't like that", description: 'Please try again.' })
  })

  it('words the failure for an unlike', async () => {
    server.use(http.post(`${API}/albums/a1/like`, () => HttpResponse.json({}, { status: 500 })))
    const { result } = renderHookWithProviders(() => useToggleLike(), { queryClient: seededClient() })

    await act(() => result.current.mutateAsync({ kind: 'ALBUM', id: 'a1', liked: false }).catch(() => {}))

    expect(sileo.error).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't remove the like" }))
  })

  it('refreshes the counts it cannot know, and only marks the Liked lists stale', async () => {
    server.use(http.post(`${API}/tracks/t1/like`, () => HttpResponse.json({ newValue: true })))
    const queryClient = seededClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHookWithProviders(() => useToggleLike(), { queryClient })

    await act(() => result.current.mutateAsync({ kind: 'TRACK', id: 't1', liked: true }))

    const calls = invalidate.mock.calls.map(([filters]) => filters)
    expect(calls).toEqual(
      expect.arrayContaining([
        { queryKey: ['tracks', 'detail', 't1'] },
        { queryKey: ['playlists'], exact: true },
        { queryKey: ['playlists', 'all'] },
        { queryKey: ['playlists', 'detail', 'likes'], refetchType: 'none' },
        { queryKey: ['albums', 'liked'], refetchType: 'none' },
      ]),
    )
    expect(calls).not.toContainEqual({ queryKey: ['albums', 'detail', 't1'] })
  })

  it("refreshes an album's detail (its owner's like count) after an album like", async () => {
    server.use(http.post(`${API}/albums/a1/like`, () => HttpResponse.json({ newValue: true })))
    const queryClient = seededClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHookWithProviders(() => useToggleLike(), { queryClient })

    await act(() => result.current.mutateAsync({ kind: 'ALBUM', id: 'a1', liked: true }))

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['albums', 'detail', 'a1'] })
  })
})
