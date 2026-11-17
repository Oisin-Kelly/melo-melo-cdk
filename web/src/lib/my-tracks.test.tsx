import { waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { trackSummary } from '@/testing/fixtures'
import { renderHookWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { useAllMyTracks } from './my-tracks'

describe('useAllMyTracks', () => {
  it('loads every page of your uploads, 100 at a time', async () => {
    const urls: string[] = []
    server.use(
      http.get(`${API}/tracks`, ({ request }) => {
        const url = new URL(request.url)
        urls.push(url.search)
        const cursor = url.searchParams.get('cursor')
        return HttpResponse.json({ items: [trackSummary(cursor ? 't2' : 't1')], nextCursor: cursor ? null : 'p2' })
      }),
    )
    const { result } = renderHookWithProviders(() => useAllMyTracks())
    await waitFor(() => expect(result.current.data?.map((t) => t.id)).toEqual(['t1', 't2']))
    expect(urls).toEqual(['?limit=100', '?limit=100&cursor=p2'])
  })
})
