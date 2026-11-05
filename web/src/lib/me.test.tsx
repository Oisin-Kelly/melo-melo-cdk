import { waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { user } from '@/testing/fixtures'
import { createTestQueryClient, renderHookWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { patchMe, useMe, userQueryKey } from './me'

describe('useMe', () => {
  it("loads the signed-in user's own profile under ['users', username]", async () => {
    server.use(http.get(`${API}/users/me`, () => HttpResponse.json(user('me', { lastSeenAt: 5 }))))

    const { result, queryClient } = renderHookWithProviders(() => useMe())

    await waitFor(() => expect(result.current.data?.lastSeenAt).toBe(5))
    expect(queryClient.getQueryData(userQueryKey('me'))).toEqual(result.current.data)
  })

  it('cannot be used while signed out', () => {
    expect(() => renderHookWithProviders(() => useMe(), { username: null })).toThrow(
      'useUsername called while signed out',
    )
  })
})

describe('patchMe', () => {
  it('merges new fields into the cached profile without a refetch', () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(userQueryKey('me'), user('me', { lastSeenAt: 1, activitySeenAt: 2 }))

    patchMe(queryClient, 'me', { activitySeenAt: 99 })

    expect(queryClient.getQueryData(userQueryKey('me'))).toMatchObject({ lastSeenAt: 1, activitySeenAt: 99 })
  })

  it('leaves an empty cache empty', () => {
    const queryClient = createTestQueryClient()
    patchMe(queryClient, 'me', { activitySeenAt: 99 })
    expect(queryClient.getQueryData(userQueryKey('me'))).toBeUndefined()
  })
})
