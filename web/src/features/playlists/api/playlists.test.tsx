import { act, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { sileo } from 'sileo'
import { describe, expect, it, vi } from 'vitest'
import { playlistDetailKey, playlistsQueryKey, type PlaylistTrackEntry } from '@/lib/playlists'
import { createTestQueryClient, renderHookWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { captureBodies, coverFile, serveStageUpload } from '@/testing/stage-upload'
import {
  useCreatePlaylist,
  useDeletePlaylist,
  usePlaylistDetail,
  useRemoveFromPlaylist,
  useUpdatePlaylist,
  type PlaylistPage,
} from './playlists'

const playlist = { id: 'p1', name: 'Mix', description: null, type: 'CUSTOM', slug: 'mix', imageUrl: null, imageBgColor: null, trackCount: 2, totalDurationSeconds: 0, createdAt: 0 } as const
const entry = (trackId: string): PlaylistTrackEntry => ({ trackId, name: trackId, duration: 60, addedAt: 0, unavailable: false })

describe('useCreatePlaylist', () => {
  it('posts the trimmed name and refreshes the playlist lists', async () => {
    const bodies = captureBodies('post', '/playlists', playlist)
    const { result, queryClient } = renderHookWithProviders(() => useCreatePlaylist())
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    const created = await act(() => result.current.mutateAsync('  Road trip '))

    expect(bodies).toEqual([{ name: 'Road trip' }])
    expect(created).toEqual(playlist)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: playlistsQueryKey })
  })
})

describe('usePlaylistDetail', () => {
  it('turns {playlist, tracks} into pages that each carry the playlist', async () => {
    server.use(
      http.get(`${API}/playlists/p1`, () =>
        HttpResponse.json({ playlist, tracks: { items: [entry('t1')], nextCursor: null } }),
      ),
    )
    const { result } = renderHookWithProviders(() => usePlaylistDetail('p1'))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.pages[0]).toEqual({ playlist, items: [entry('t1')], nextCursor: null })
  })
})

describe('useRemoveFromPlaylist', () => {
  function seeded() {
    const queryClient = createTestQueryClient()
    const page: PlaylistPage = { playlist, items: [entry('t1'), entry('t2')], nextCursor: null }
    queryClient.setQueryData(playlistDetailKey('p1'), { pages: [page], pageParams: [null] })
    return queryClient
  }
  const rows = (queryClient: ReturnType<typeof createTestQueryClient>) =>
    queryClient.getQueryData<{ pages: PlaylistPage[] }>(playlistDetailKey('p1'))!.pages[0].items.map((e) => e.trackId)

  it('drops the row before the server answers', async () => {
    let release!: () => void
    server.use(
      http.delete(`${API}/playlists/p1/tracks/t1`, async () => {
        await new Promise<void>((r) => (release = r))
        return HttpResponse.json({ trackId: 't1', removed: true })
      }),
      http.get(`${API}/playlists/p1`, () => HttpResponse.json({ playlist, tracks: { items: [entry('t2')], nextCursor: null } })),
    )
    const queryClient = seeded()
    const { result } = renderHookWithProviders(() => useRemoveFromPlaylist('p1'), { queryClient })

    act(() => result.current.mutate('t1'))

    await waitFor(() => expect(rows(queryClient)).toEqual(['t2']))
    release()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('puts the row back and says so when it fails', async () => {
    server.use(
      http.delete(`${API}/playlists/p1/tracks/t1`, () => HttpResponse.json({}, { status: 500 })),
      http.get(`${API}/playlists/p1`, () => new Promise(() => {})), // the settle refetch never lands
    )
    const queryClient = seeded()
    const { result } = renderHookWithProviders(() => useRemoveFromPlaylist('p1'), { queryClient })

    await act(() => result.current.mutateAsync('t1').catch(() => {}))

    expect(rows(queryClient)).toEqual(['t1', 't2'])
    expect(sileo.error).toHaveBeenCalledWith({ title: "Couldn't remove that track", description: 'Please try again.' })
  })
})

describe('useUpdatePlaylist', () => {
  const details = { name: ' Mix 2 ', description: '', cover: { file: null, clear: false } }

  it('trims, blanks → null, slug only when given; stages covers under playlists/', async () => {
    serveStageUpload()
    const bodies = captureBodies('put', '/playlists/p1', playlist)
    const { result } = renderHookWithProviders(() => useUpdatePlaylist('p1'))

    await act(() => result.current.mutateAsync(details))
    await act(() => result.current.mutateAsync({ ...details, slug: 'mix-2', cover: { file: coverFile(), clear: false } }))

    expect(bodies[0]).toEqual({ name: 'Mix 2', description: null, clearedImage: false })
    expect(bodies[1]).toMatchObject({ slug: 'mix-2', imageKey: expect.stringMatching(/^me\/playlists\//) })
  })

  it('refreshes the playlist and the lists (sidebar + search)', async () => {
    captureBodies('put', '/playlists/p1', playlist)
    const { result, queryClient } = renderHookWithProviders(() => useUpdatePlaylist('p1'))
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await act(() => result.current.mutateAsync(details))

    expect(invalidate.mock.calls.map(([f]) => f)).toEqual([
      { queryKey: playlistDetailKey('p1') },
      { queryKey: playlistsQueryKey, exact: true },
      { queryKey: ['playlists', 'all'] },
      { predicate: expect.any(Function) }, // track pages' "In your playlists"
    ])
  })
})

describe('useDeletePlaylist', () => {
  it('deletes and refreshes the lists', async () => {
    let deleted = false
    server.use(
      http.delete(`${API}/playlists/p1`, () => {
        deleted = true
        return HttpResponse.json({ message: 'ok' })
      }),
    )
    const { result, queryClient } = renderHookWithProviders(() => useDeletePlaylist('p1'))
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await act(() => result.current.mutateAsync())

    expect(deleted).toBe(true)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: playlistsQueryKey, exact: true })
  })
})
