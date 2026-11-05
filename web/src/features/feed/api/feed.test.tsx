import { act, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { trackSummary } from '@/testing/fixtures'
import { renderHookWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { useFeed, useMarkSeen, useProgress, type FeedSort, type FeedType } from './feed'

describe('useFeed', () => {
  it.each<[FeedType, FeedSort, string]>([
    ['ALL', 'newest', ''],
    ['TRACK', 'newest', '?type=TRACK'],
    ['ALBUM', 'oldest', '?type=ALBUM&sort=asc'],
    ['ALL', 'oldest', '?sort=asc'],
  ])('%s / %s → GET /feed%s', async (type, sort, query) => {
    const urls: string[] = []
    server.use(
      http.get(`${API}/feed`, ({ request }) => {
        urls.push(new URL(request.url).search)
        return HttpResponse.json({ items: [], nextCursor: null })
      }),
    )

    const { result } = renderHookWithProviders(() => useFeed(type, sort))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(urls).toEqual([query])
  })

  it('keeps the filters when it pages, and caches each filter separately', async () => {
    const urls: string[] = []
    server.use(
      http.get(`${API}/feed`, ({ request }) => {
        const url = new URL(request.url)
        urls.push(url.search)
        return HttpResponse.json({ items: [], nextCursor: url.searchParams.get('cursor') ? null : 'abc' })
      }),
    )
    const { result, queryClient } = renderHookWithProviders(() => useFeed('TRACK', 'oldest'))
    await waitFor(() => expect(result.current.hasNextPage).toBe(true))

    await act(() => result.current.fetchNextPage())

    expect(urls[1]).toBe('?type=TRACK&sort=asc&cursor=abc')
    expect(queryClient.getQueryData(['feed', 'TRACK', 'oldest'])).toBeDefined()
  })
})

describe('useProgress', () => {
  it('is the resume slot when there is one', async () => {
    const entry = { contextType: 'TRACK', contextId: 't1', trackId: 't1', positionSeconds: 42, updatedAt: 1, track: trackSummary('t1') }
    server.use(http.get(`${API}/me/progress`, () => HttpResponse.json(entry)))

    const { result } = renderHookWithProviders(() => useProgress())

    await waitFor(() => expect(result.current.data).toEqual(entry))
  })

  it('is null on 204 (nothing to resume)', async () => {
    server.use(http.get(`${API}/me/progress`, () => new HttpResponse(null, { status: 204 })))

    const { result } = renderHookWithProviders(() => useProgress())

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })

  it('never retries a failure (it is only a convenience card)', async () => {
    let calls = 0
    server.use(
      http.get(`${API}/me/progress`, () => {
        calls++
        return HttpResponse.json({}, { status: 500 })
      }),
    )

    const { result } = renderHookWithProviders(() => useProgress())

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(calls).toBe(1)
  })
})

describe('useMarkSeen', () => {
  it('posts /me/seen', async () => {
    let posted = false
    server.use(
      http.post(`${API}/me/seen`, () => {
        posted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { result } = renderHookWithProviders(() => useMarkSeen())

    await act(() => result.current.mutateAsync())

    expect(posted).toBe(true)
  })
})
