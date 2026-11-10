import { act, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderHookWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { useFeed, useMarkSeen, type FeedSort, type FeedType } from './feed'

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
