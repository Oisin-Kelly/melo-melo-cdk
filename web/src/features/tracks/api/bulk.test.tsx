import { act } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { renderHookWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { useAddTracksToPlaylist, useDeleteTracks, useShareTracks } from './bulk'

const failure = () => HttpResponse.json({ statusCode: 500, message: 'x', error: 'x' }, { status: 500 })
const playlist = { id: 'p1', name: 'Road trip', type: 'CUSTOM' as const, description: null, imageUrl: null, imageBgColor: null, trackCount: 0, totalDurationSeconds: 0, createdAt: 0 }

describe('useDeleteTracks', () => {
  it('deletes each, carries on past a failure and refreshes the lists once', async () => {
    const deleted: string[] = []
    server.use(
      http.delete(`${API}/tracks/:id`, ({ params }) => {
        if (params.id === 't2') return failure()
        deleted.push(params.id as string)
        return HttpResponse.json({})
      }),
    )
    const { result, queryClient } = renderHookWithProviders(() => useDeleteTracks())
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    const outcome = await act(() => result.current.mutateAsync(['t1', 't2', 't3']))

    expect(deleted.sort()).toEqual(['t1', 't3'])
    expect(outcome.failed).toEqual(['t2'])
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([['tracks'], ['albums'], ['playlists'], ['feed'], ['users']])
  })

  it('leaves the caches alone when nothing was deleted', async () => {
    server.use(http.delete(`${API}/tracks/:id`, failure))
    const { result, queryClient } = renderHookWithProviders(() => useDeleteTracks())
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const outcome = await act(() => result.current.mutateAsync(['t1']))
    expect(outcome).toEqual({ done: [], failed: ['t1'] })
    expect(invalidate).not.toHaveBeenCalled()
  })
})

describe('useAddTracksToPlaylist', () => {
  it('adds them one after another, in order', async () => {
    const added: string[] = []
    server.use(
      http.post(`${API}/playlists/p1/tracks/:id`, ({ params }) => {
        added.push(params.id as string)
        return params.id === 't2' ? failure() : HttpResponse.json({ trackId: params.id, added: true })
      }),
    )
    const { result, queryClient } = renderHookWithProviders(() => useAddTracksToPlaylist())
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    const outcome = await act(() => result.current.mutateAsync({ playlist, ids: ['t1', 't2', 't3'] }))

    expect(added).toEqual(['t1', 't2', 't3'])
    expect(outcome).toEqual({ done: ['t1', 't3'], failed: ['t2'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['playlists', 'detail', 'p1'] })
  })
})

describe('useShareTracks', () => {
  it('shares each track with the same people and caption', async () => {
    const bodies: Record<string, unknown> = {}
    server.use(
      http.post(`${API}/tracks/:id/share`, async ({ request, params }) => {
        bodies[params.id as string] = await request.json()
        return HttpResponse.json({ sharedWith: ['ada'] })
      }),
    )
    const { result } = renderHookWithProviders(() => useShareTracks())

    const outcome = await act(() => result.current.mutateAsync({ ids: ['t1', 't2'], add: ['ada'], caption: '  hi ' }))

    expect(outcome.done.sort()).toEqual(['t1', 't2'])
    expect(bodies).toEqual({
      t1: { add: ['ada'], remove: [], caption: 'hi' },
      t2: { add: ['ada'], remove: [], caption: 'hi' },
    })
  })
})
