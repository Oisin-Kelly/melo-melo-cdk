import { act, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { sileo } from 'sileo'
import { describe, expect, it, vi } from 'vitest'
import { renderHookWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { playlistDetailKey, playlistsQueryKey, useAddToPlaylist, usePlaylists, type Playlist } from './playlists'

const playlist = (id: string, extra: Partial<Playlist> = {}): Playlist => ({
  id,
  name: `Playlist ${id}`,
  description: null,
  type: 'CUSTOM',
  slug: id,
  imageUrl: null,
  imageBgColor: null,
  trackCount: 0,
  totalDurationSeconds: 0,
  createdAt: 0,
  ...extra,
})

describe('usePlaylists', () => {
  it('fetches one page of 100 and gives back just the playlists', async () => {
    let limit: string | null = null
    server.use(
      http.get(`${API}/playlists`, ({ request }) => {
        limit = new URL(request.url).searchParams.get('limit')
        return HttpResponse.json({ items: [playlist('likes', { type: 'LIKES' }), playlist('p1')], nextCursor: null })
      }),
    )

    const { result } = renderHookWithProviders(() => usePlaylists())

    await waitFor(() => expect(result.current.data?.map((p) => p.id)).toEqual(['likes', 'p1']))
    expect(limit).toBe('100')
  })
})

describe('useAddToPlaylist', () => {
  it('adds the track and says so', async () => {
    server.use(http.post(`${API}/playlists/p1/tracks/t1`, () => HttpResponse.json({ trackId: 't1', added: true })))
    const { result } = renderHookWithProviders(() => useAddToPlaylist())

    await act(() => result.current.mutateAsync({ playlist: playlist('p1'), trackId: 't1' }))

    expect(sileo.success).toHaveBeenCalledWith({ title: 'Added to playlist', description: 'Playlist p1' })
  })

  it('treats a track already there as "Already in", not an error', async () => {
    server.use(http.post(`${API}/playlists/p1/tracks/t1`, () => HttpResponse.json({ trackId: 't1', added: false })))
    const { result } = renderHookWithProviders(() => useAddToPlaylist())

    await act(() => result.current.mutateAsync({ playlist: playlist('p1'), trackId: 't1' }))

    expect(sileo.info).toHaveBeenCalledWith({ title: 'Already in Playlist p1' })
    expect(sileo.success).not.toHaveBeenCalled()
  })

  it('reports a failure', async () => {
    server.use(http.post(`${API}/playlists/p1/tracks/t1`, () => HttpResponse.json({}, { status: 500 })))
    const { result } = renderHookWithProviders(() => useAddToPlaylist())

    await act(() => result.current.mutateAsync({ playlist: playlist('p1'), trackId: 't1' }).catch(() => {}))

    expect(sileo.error).toHaveBeenCalledWith({ title: "Couldn't add to the playlist", description: 'Please try again.' })
  })

  it("refreshes the list's totals and that playlist either way", async () => {
    server.use(http.post(`${API}/playlists/p1/tracks/t1`, () => HttpResponse.json({}, { status: 500 })))
    const { result, queryClient } = renderHookWithProviders(() => useAddToPlaylist())
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await act(() => result.current.mutateAsync({ playlist: playlist('p1'), trackId: 't1' }).catch(() => {}))

    expect(invalidate).toHaveBeenCalledWith({ queryKey: playlistsQueryKey, exact: true })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: playlistDetailKey('p1') })
  })
})
