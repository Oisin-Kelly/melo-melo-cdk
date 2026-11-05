import { act, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { userQueryKey } from '@/lib/me'
import { user, userSummary } from '@/testing/fixtures'
import { createTestQueryClient, renderHookWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import {
  ACTIVITY_PAGE_SIZE,
  useActivity,
  useActivityUnread,
  useMarkActivitySeen,
  useRefreshOnNewShares,
  type ActivityEntry,
} from './activity'

const entry = (createdAt: number, type: ActivityEntry['type'] = 'TRACK_LIKED'): ActivityEntry => ({
  type,
  actor: userSummary('friend'),
  targetType: type === 'USER_FOLLOWED' ? 'USER' : 'TRACK',
  targetId: 't1',
  createdAt,
})

describe('useActivity', () => {
  it('pages through /activity by cursor', async () => {
    const cursors: (string | null)[] = []
    server.use(
      http.get(`${API}/activity`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        cursors.push(cursor)
        return HttpResponse.json(cursor ? { items: [entry(1)], nextCursor: null } : { items: [entry(2)], nextCursor: 'next page' })
      }),
    )
    const { result } = renderHookWithProviders(() => useActivity())
    await waitFor(() => expect(result.current.hasNextPage).toBe(true))

    await act(() => result.current.fetchNextPage())

    await waitFor(() => expect(result.current.hasNextPage).toBe(false))
    expect(cursors).toEqual([null, 'next page'])
  })
})

describe('useActivityUnread', () => {
  function serve(items: ActivityEntry[], nextCursor: string | null, activitySeenAt?: number) {
    server.use(
      http.get(`${API}/users/me`, () => HttpResponse.json(user('me', { activitySeenAt }))),
      http.get(`${API}/activity`, () => HttpResponse.json({ items, nextCursor })),
    )
  }

  it('counts rows newer than activitySeenAt', async () => {
    serve([entry(30), entry(20), entry(10)], null, 15)
    const { result } = renderHookWithProviders(() => useActivityUnread())

    await waitFor(() => expect(result.current.isReady).toBe(true))
    expect(result.current.badge).toBe('2')
    expect(result.current.seenAt).toBe(15)
  })

  it('has no badge when everything is seen, and counts everything when never seen', async () => {
    serve([entry(10)], null, 10)
    const seen = renderHookWithProviders(() => useActivityUnread())
    await waitFor(() => expect(seen.result.current.isReady).toBe(true))
    expect(seen.result.current.badge).toBeNull()

    serve([entry(10)], null, undefined)
    const never = renderHookWithProviders(() => useActivityUnread())
    await waitFor(() => expect(never.result.current.isReady).toBe(true))
    expect(never.result.current.badge).toBe('1')
  })

  it('says "20+" only when the whole first page is new and more pages exist', async () => {
    const full = Array.from({ length: ACTIVITY_PAGE_SIZE }, (_, i) => entry(100 + i))

    serve(full, 'more')
    const more = renderHookWithProviders(() => useActivityUnread())
    await waitFor(() => expect(more.result.current.isReady).toBe(true))
    expect(more.result.current.badge).toBe('20+')

    serve(full, null)
    const exact = renderHookWithProviders(() => useActivityUnread())
    await waitFor(() => expect(exact.result.current.isReady).toBe(true))
    expect(exact.result.current.badge).toBe('20')
  })

  it('is not ready until both the profile and the first page have loaded', () => {
    server.use(
      http.get(`${API}/users/me`, () => new Promise(() => {})),
      http.get(`${API}/activity`, () => new Promise(() => {})),
    )
    const { result } = renderHookWithProviders(() => useActivityUnread())
    expect(result.current.isReady).toBe(false)
    expect(result.current.badge).toBeNull()
  })

  it('markSeen posts only when something is unread, and clears the badge at once', async () => {
    const posts = vi.fn()
    serve([entry(30)], null, 10)
    server.use(
      http.post(`${API}/me/activity-seen`, () => {
        posts()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { result } = renderHookWithProviders(() => useActivityUnread())
    await waitFor(() => expect(result.current.badge).toBe('1'))

    act(() => result.current.markSeen())

    await waitFor(() => expect(result.current.badge).toBeNull())
    expect(posts).toHaveBeenCalledTimes(1)

    act(() => result.current.markSeen()) // nothing unread now
    await new Promise((r) => setTimeout(r, 20))
    expect(posts).toHaveBeenCalledTimes(1)
  })
})

describe('useMarkActivitySeen', () => {
  it("writes the new marker into the cached profile without refetching", async () => {
    server.use(http.post(`${API}/me/activity-seen`, () => new HttpResponse(null, { status: 204 })))
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(userQueryKey('me'), user('me', { activitySeenAt: 1 }))
    vi.spyOn(Date, 'now').mockReturnValue(5_000)
    const { result } = renderHookWithProviders(() => useMarkActivitySeen(), { queryClient })

    await act(() => result.current.mutateAsync())

    expect(queryClient.getQueryData(userQueryKey('me'))).toMatchObject({ activitySeenAt: 5_000 })
  })
})

describe('useRefreshOnNewShares', () => {
  function setup(initial: ActivityEntry[] | undefined) {
    const queryClient = createTestQueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const hook = renderHookWithProviders(({ page }: { page: ActivityEntry[] | undefined }) => useRefreshOnNewShares(page), {
      queryClient,
      initialProps: { page: initial },
    })
    return { ...hook, invalidate }
  }

  it('does nothing on the first load', () => {
    const { invalidate } = setup([entry(50, 'TRACK_SHARED')])
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('refreshes what a newer share adds to: feed, library, shared albums, profiles', () => {
    const { rerender, invalidate } = setup([entry(50, 'TRACK_SHARED')])

    rerender({ page: [entry(60, 'ALBUM_SHARED'), entry(50, 'TRACK_SHARED')] })

    expect(invalidate.mock.calls.map(([f]) => f)).toEqual([
      { queryKey: ['feed'] },
      { queryKey: ['tracks', 'library'] },
      { queryKey: ['albums', 'shared'] },
      { queryKey: ['users'] },
    ])
  })

  it('ignores newer likes and follows, and a share it has already seen', () => {
    const { rerender, invalidate } = setup([entry(50, 'TRACK_SHARED')])

    rerender({ page: [entry(90, 'TRACK_LIKED'), entry(80, 'USER_FOLLOWED'), entry(50, 'TRACK_SHARED')] })
    rerender({ page: [entry(50, 'TRACK_SHARED')] })

    expect(invalidate).not.toHaveBeenCalled()
  })

  it('treats the first page arriving after a pending start as the first load', () => {
    const { rerender, invalidate } = setup(undefined)

    rerender({ page: [entry(50, 'TRACK_SHARED')] })

    expect(invalidate).not.toHaveBeenCalled()
  })
})
