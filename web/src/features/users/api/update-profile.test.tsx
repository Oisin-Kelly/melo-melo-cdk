import { act } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { userQueryKey } from '@/lib/me'
import { user } from '@/testing/fixtures'
import { createTestQueryClient, renderHookWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { useUpdateProfile, type ProfileDraft } from './update-profile'

const draft: ProfileDraft = {
  displayName: 'Oisín',
  firstName: null,
  lastName: null,
  city: 'Dublin',
  country: null,
  bio: null,
  followersPrivate: false,
  followingsPrivate: true,
  incomingShares: 'FOLLOWING',
}

function serveUpdate(response = user('me', { displayName: 'Oisín' })) {
  const bodies: Record<string, unknown>[] = []
  server.use(
    http.post(`${API}/profile/update`, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json(response)
    }),
  )
  return bodies
}

describe('useUpdateProfile', () => {
  it('sends the whole draft; no photo change → no imageKey and nothing cleared', async () => {
    const bodies = serveUpdate()
    const { result } = renderHookWithProviders(() => useUpdateProfile())

    await act(() => result.current.mutateAsync({ draft, file: null, clearImage: false }))

    expect(bodies).toEqual([{ ...draft, clearedImage: false }])
  })

  it('stages a new photo first and sends its key', async () => {
    const bodies = serveUpdate()
    server.use(
      http.get(`${API}/buckets/dropbox`, ({ request }) =>
        HttpResponse.json({ url: 'https://s3.test/put', key: `me/${new URL(request.url).searchParams.get('key')}` }),
      ),
      http.put('https://s3.test/put', () => new HttpResponse(null, { status: 200 })),
    )
    const { result } = renderHookWithProviders(() => useUpdateProfile())

    await act(() =>
      result.current.mutateAsync({ draft, file: new File(['x'], 'me.png', { type: 'image/png' }), clearImage: true }),
    )

    expect(bodies[0].imageKey).toMatch(/^me\/profile\/.+\.png$/)
    expect(bodies[0].clearedImage).toBe(false) // a new photo wins over "remove"
  })

  it('removes the photo when asked and there is no new one', async () => {
    const bodies = serveUpdate()
    const { result } = renderHookWithProviders(() => useUpdateProfile())

    await act(() => result.current.mutateAsync({ draft, file: null, clearImage: true }))

    expect(bodies[0]).toMatchObject({ clearedImage: true })
    expect(bodies[0].imageKey).toBeUndefined()
  })

  it('merges the response into your cached profile, keeping the private seen markers', async () => {
    serveUpdate(user('me', { displayName: 'Oisín' }))
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(userQueryKey('me'), user('me', { lastSeenAt: 7, activitySeenAt: 8 }))
    const { result } = renderHookWithProviders(() => useUpdateProfile(), { queryClient })

    await act(() => result.current.mutateAsync({ draft, file: null, clearImage: false }))

    expect(queryClient.getQueryData(userQueryKey('me'))).toMatchObject({
      displayName: 'Oisín',
      lastSeenAt: 7,
      activitySeenAt: 8,
    })
  })

  it('refreshes every non-profile query (your name and photo are on rows everywhere)', async () => {
    serveUpdate()
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(['feed', 'ALL', 'newest'], { pages: [] })
    queryClient.setQueryData(userQueryKey('me'), user('me'))
    const { result } = renderHookWithProviders(() => useUpdateProfile(), { queryClient })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await act(() => result.current.mutateAsync({ draft, file: null, clearImage: false }))

    const { predicate } = invalidate.mock.calls[0][0] as unknown as { predicate: (q: { queryKey: unknown[] }) => boolean }
    expect(predicate({ queryKey: ['feed', 'ALL', 'newest'] })).toBe(true)
    expect(predicate({ queryKey: ['users', 'me'] })).toBe(false)
  })
})
