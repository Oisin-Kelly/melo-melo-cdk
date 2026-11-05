import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { trackSummary, userSummary } from '@/testing/fixtures'
import { renderRoutes } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { TrackPeoplePage } from './track-people-page'

const notFound = () => HttpResponse.json({ statusCode: 404, message: 'x', error: 'Not Found' }, { status: 404 })

beforeEach(() => {
  server.use(
    http.get(`${API}/tracks/t1`, () =>
      HttpResponse.json({ ...trackSummary('t1', { name: 'My Song', slug: 'my-song', owner: userSummary('me') }), description: null, genre: null }),
    ),
    http.get(`${API}/tracks/t1/recipients`, () =>
      HttpResponse.json({ items: [{ user: userSummary('ada', { displayName: 'Ada' }), sharedAt: 1 }, { user: userSummary('grace', { displayName: 'Grace' }), sharedAt: 2 }] }),
    ),
    http.get(`${API}/tracks/t1/likes`, () => HttpResponse.json({ items: [{ user: userSummary('dan', { displayName: 'Dan' }), likedAt: 1 }], nextCursor: null })),
  )
})

function renderAt(path: string, kind: 'shared-with' | 'likes') {
  const result = renderRoutes(
    [
      { path: '/tracks/:id/:kind', element: <TrackPeoplePage trackId="t1" kind={kind} /> },
      { path: '/:username/:slug/:kind', element: <TrackPeoplePage trackId="t1" kind={kind} /> },
    ],
    { initialEntries: [path] },
  )
  return { ...result, user: userEvent.setup() }
}

describe('TrackPeoplePage', () => {
  it('lists who it is shared with, each linking to their profile, with a search', async () => {
    const { user } = renderAt('/me/my-song/shared-with', 'shared-with')

    expect(await screen.findByRole('heading', { name: 'Shared with' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Ada/ })).toHaveAttribute('href', '/ada')

    await user.type(screen.getByLabelText('Search people'), 'gra')
    expect(screen.queryByRole('link', { name: /Ada/ })).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('Search people'))
    await user.type(screen.getByLabelText('Search people'), 'nobody')
    expect(screen.getByText('No one matches “nobody”.')).toBeInTheDocument()
  })

  it('lists who liked it', async () => {
    renderAt('/me/my-song/likes', 'likes')
    expect(await screen.findByRole('heading', { name: 'Liked by' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Dan/ })).toBeInTheDocument()
  })

  it('moves an old id link to the readable URL', async () => {
    const { router } = renderAt('/tracks/t1/likes', 'likes')
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/me/my-song/likes'))
  })

  it("is owner-only: anyone else's request is not available", async () => {
    server.use(http.get(`${API}/tracks/t1/recipients`, notFound))
    renderAt('/me/my-song/shared-with', 'shared-with')
    expect(await screen.findByText("This list isn't available")).toBeInTheDocument()
  })

  it('says when nobody has it yet', async () => {
    server.use(http.get(`${API}/tracks/t1/recipients`, () => HttpResponse.json({ items: [] })))
    renderAt('/me/my-song/shared-with', 'shared-with')
    expect(await screen.findByText('Not shared with anyone yet')).toBeInTheDocument()
  })
})
