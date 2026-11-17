import { act, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { sileo } from 'sileo'
import { describe, expect, it, vi } from 'vitest'
import { userQueryKey } from '@/lib/me'
import { user } from '@/testing/fixtures'
import { createTestQueryClient, renderHookWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { useFollowStatus, useToggleFollow } from '@/lib/people'
import {
  useAlbumsSharedFrom,
  useFollowList,
  useMyAlbums,
  useMyTracks,
  useTracksSharedFrom,
  useUser,
} from './profile'

const statusKey = ['users', 'bob', 'follow-status']

describe('useUser / useFollowStatus', () => {
  it('loads a profile and whether you follow them', async () => {
    server.use(
      http.get(`${API}/users/bob`, () => HttpResponse.json(user('bob'))),
      http.get(`${API}/users/bob/follow-status`, () => HttpResponse.json({ followStatus: true })),
    )

    const profile = renderHookWithProviders(() => useUser('bob'))
    const status = renderHookWithProviders(() => useFollowStatus('bob', true))

    await waitFor(() => expect(profile.result.current.data?.username).toBe('bob'))
    await waitFor(() => expect(status.result.current.data).toBe(true))
  })

  it("doesn't ask about following when disabled (your own profile)", async () => {
    const { result } = renderHookWithProviders(() => useFollowStatus('me', false))
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current.fetchStatus).toBe('idle')
  })
})

describe('useToggleFollow', () => {
  function seeded() {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(statusKey, { followStatus: false })
    queryClient.setQueryData(userQueryKey('bob'), user('bob', { followerCount: 3 }))
    return queryClient
  }

  it('flips the button and their follower count before the server answers, and posts the new value', async () => {
    let release!: () => void
    let body: unknown
    server.use(
      http.post(`${API}/users/bob/follow-user`, async ({ request }) => {
        body = await request.json()
        await new Promise<void>((r) => (release = r))
        return HttpResponse.json({})
      }),
    )
    const queryClient = seeded()
    const { result } = renderHookWithProviders(() => useToggleFollow('bob'), { queryClient })

    act(() => result.current.mutate(true))

    await waitFor(() => expect(queryClient.getQueryData(statusKey)).toEqual({ followStatus: true }))
    expect(queryClient.getQueryData(userQueryKey('bob'))).toMatchObject({ followerCount: 4 })
    release()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(body).toEqual({ newValue: true })
  })

  it('never takes the follower count below zero', async () => {
    server.use(http.post(`${API}/users/bob/follow-user`, () => new Promise(() => {})))
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(userQueryKey('bob'), user('bob', { followerCount: 0 }))
    const { result } = renderHookWithProviders(() => useToggleFollow('bob'), { queryClient })

    act(() => result.current.mutate(false))

    await waitFor(() => expect(queryClient.getQueryData(userQueryKey('bob'))).toMatchObject({ followerCount: 0 }))
  })

  it('rolls back and says so when it fails', async () => {
    server.use(http.post(`${API}/users/bob/follow-user`, () => HttpResponse.json({}, { status: 500 })))
    const queryClient = seeded()
    const { result } = renderHookWithProviders(() => useToggleFollow('bob'), { queryClient })

    await act(() => result.current.mutateAsync(true).catch(() => {}))

    expect(queryClient.getQueryData(statusKey)).toEqual({ followStatus: false })
    expect(queryClient.getQueryData(userQueryKey('bob'))).toMatchObject({ followerCount: 3 })
    expect(sileo.error).toHaveBeenCalledWith({ title: "Couldn't follow", description: 'Please try again.' })
  })

  it('then refreshes both their page and yours', async () => {
    server.use(http.post(`${API}/users/bob/follow-user`, () => HttpResponse.json({})))
    const queryClient = seeded()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHookWithProviders(() => useToggleFollow('bob'), { queryClient, username: 'me' })

    await act(() => result.current.mutateAsync(false))

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users', 'bob'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users', 'me'] })
  })
})

describe('profile lists', () => {
  function capture(path: string) {
    const urls: string[] = []
    server.use(
      http.get(`${API}${path}`, ({ request }) => {
        urls.push(new URL(request.url).search)
        return HttpResponse.json({ items: [], nextCursor: null })
      }),
    )
    return urls
  }

  it.each<[string, () => { isSuccess: boolean }, string, string, readonly unknown[]]>([
    ['albums shared from them', () => useAlbumsSharedFrom('bob', true), '/users/bob/albums/shared', '?limit=20', ['users', 'bob', 'shared-albums']],
    ['tracks shared from them', () => useTracksSharedFrom('bob', true), '/users/bob/shared', '', ['users', 'bob', 'shared-tracks']],
    ['your albums', () => useMyAlbums(true), '/albums', '?limit=20', ['albums', 'mine', 'list']],
    ['your tracks', () => useMyTracks(true), '/tracks', '?limit=20', ['tracks', 'mine', 'list']],
    ['their followers', () => useFollowList('bob', 'followers'), '/users/bob/followers', '', ['users', 'bob', 'followers']],
    ['who they follow', () => useFollowList('bob', 'following'), '/users/bob/followings', '', ['users', 'bob', 'following']],
  ])('%s: GET %s%s, cached as %j', async (_, hook, path, query, key) => {
    const urls = capture(path)
    const { result, queryClient } = renderHookWithProviders(hook)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(urls).toEqual([query])
    expect(queryClient.getQueryData(key)).toBeDefined()
  })

  it('stays idle when disabled', async () => {
    const { result } = renderHookWithProviders(() => useMyTracks(false))
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current.fetchStatus).toBe('idle')
  })
})
