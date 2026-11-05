import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { albumSummary, trackSummary, user, userSummary } from '@/testing/fixtures'
import { renderRoutes } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { FollowListPage } from './follow-list-page'
import { ProfilePage } from './profile-page'

const page = <T,>(items: T[]) => ({ items, nextCursor: null })

function serveProfiles({ bob = user('bob', { displayName: 'Bob', bio: 'Makes noise', followerCount: 4, sharedWithYouCount: 2 }) } = {}) {
  server.use(
    http.get(`${API}/users/me`, () => HttpResponse.json(user('me', { displayName: 'Me' }))),
    http.get(`${API}/users/bob`, () => HttpResponse.json(bob)),
    http.get(`${API}/users/ghost`, () => HttpResponse.json({ statusCode: 404, message: 'x', error: 'Not Found' }, { status: 404 })),
    http.get(`${API}/users/bob/follow-status`, () => HttpResponse.json({ followStatus: false })),
    http.get(`${API}/users/bob/albums/shared`, () => HttpResponse.json(page([{ album: albumSummary('a1', { name: 'Bob album' }), sharedAt: 1 }]))),
    http.get(`${API}/users/bob/shared`, () =>
      HttpResponse.json(page([{ track: trackSummary('t1', { name: 'Bob track' }), sharedAt: Date.now(), caption: 'hear this' }])),
    ),
    http.get(`${API}/albums`, () => HttpResponse.json(page([]))),
    http.get(`${API}/tracks`, () => HttpResponse.json(page([trackSummary('t9', { name: 'My upload' })]))),
    http.get(`${API}/playlists`, () => HttpResponse.json(page([]))),
  )
}

function renderAt(path: string) {
  const result = renderRoutes(
    [
      { path: '/:username', element: <ProfilePage /> },
      { path: '/:username/followers', element: <FollowListPage kind="followers" /> },
      { path: '/:username/following', element: <FollowListPage kind="following" /> },
      { path: '/settings/profile', element: <p>Edit profile screen</p> },
    ],
    { initialEntries: [path], username: 'me' },
  )
  return { ...result, user: userEvent.setup() }
}

beforeEach(() => serveProfiles())

describe('ProfilePage', () => {
  it("someone else's: their bio, follower count, and what they've shared with you", async () => {
    renderAt('/bob')

    expect(await screen.findByRole('heading', { name: 'Bob' })).toBeInTheDocument()
    expect(screen.getByText('Makes noise')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /4 followers/ })).toHaveAttribute('href', '/bob/followers')
    expect(await screen.findByText('Bob album')).toBeInTheDocument()
    expect(await screen.findByText('Bob track')).toBeInTheDocument()
    expect(screen.getByText('“hear this”')).toBeInTheDocument()
  })

  it('works with any casing in the URL', async () => {
    renderAt('/BOB')
    expect(await screen.findByRole('heading', { name: 'Bob' })).toBeInTheDocument()
  })

  it('follows optimistically: the button and count flip straight away', async () => {
    let release!: () => void
    server.use(
      http.post(`${API}/users/bob/follow-user`, async () => {
        await new Promise<void>((r) => (release = r))
        return HttpResponse.json({})
      }),
    )
    const { user: u } = renderAt('/bob')
    await u.click(await screen.findByRole('button', { name: /^Follow/ }))

    expect(await screen.findByRole('button', { name: /^Following/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /5 followers/ })).toBeInTheDocument()
    release()
  })

  it("your own: Edit profile instead of Follow, and what you've made", async () => {
    renderAt('/me')

    expect(await screen.findByRole('link', { name: 'Edit profile' })).toHaveAttribute('href', '/settings/profile')
    expect(screen.queryByRole('button', { name: /^Follow/ })).not.toBeInTheDocument()
    expect(await screen.findByText('My upload')).toBeInTheDocument()
    expect(screen.getByText('YOUR TRACKS')).toBeInTheDocument()
  })

  it('a private follower list is not a link', async () => {
    serveProfiles({ bob: user('bob', { displayName: 'Bob', followersPrivate: true, followerCount: 4 }) })
    renderAt('/bob')
    await screen.findByRole('heading', { name: 'Bob' })
    expect(screen.queryByRole('link', { name: /followers/ })).not.toBeInTheDocument()
  })

  it('copies the root profile link', async () => {
    // user-event provides the clipboard, so read back what was written
    const { user: u } = renderAt('/bob')

    await u.click(await screen.findByRole('button', { name: 'More profile options' }))
    await u.click(await screen.findByRole('menuitem', { name: 'Copy profile link' }))

    await vi.waitFor(async () => expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/bob`))
  })

  it('says when there is no such person', async () => {
    renderAt('/ghost')
    expect(await screen.findByText('No one here')).toBeInTheDocument()
    expect(screen.getByText("There's no one called @ghost.")).toBeInTheDocument()
  })
})

describe('FollowListPage', () => {
  it('lists the people, each linking to their profile, with a search over them', async () => {
    server.use(
      http.get(`${API}/users/bob/followers`, () =>
        HttpResponse.json(page([userSummary('ada', { displayName: 'Ada' }), userSummary('grace', { displayName: 'Grace' })])),
      ),
    )
    const { user: u } = renderAt('/bob/followers')

    expect(await screen.findByRole('link', { name: /Ada/ })).toHaveAttribute('href', '/ada')
    await u.type(screen.getByLabelText('Search people'), 'gra')
    expect(screen.queryByRole('link', { name: /Ada/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Grace/ })).toBeInTheDocument()
  })

  it('says a private list is private (no search box)', async () => {
    server.use(
      http.get(`${API}/users/bob/followings`, () =>
        HttpResponse.json({ statusCode: 403, message: 'private', error: 'Forbidden' }, { status: 403 }),
      ),
    )
    renderAt('/bob/following')
    expect(await screen.findByText('This list is private')).toBeInTheDocument()
    expect(screen.queryByLabelText('Search people')).not.toBeInTheDocument()
  })

  it('says when there is nobody yet', async () => {
    server.use(http.get(`${API}/users/bob/followers`, () => HttpResponse.json(page([]))))
    renderAt('/bob/followers')
    expect(await screen.findByText('No followers yet')).toBeInTheDocument()
  })
})
