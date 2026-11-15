import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { sileo } from 'sileo'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { albumSummary, trackSummary, userSummary } from '@/testing/fixtures'
import { LocationProbe, renderRoutes } from '@/testing/providers'
import { API, server } from '@/testing/server'
import type { Album } from '../api/albums'
import { AlbumPage } from './album-page'

const owner = userSummary('me', { displayName: 'Me' })
const mine: Album = { ...albumSummary('a1', { name: 'Summer', slug: 'summer', owner, trackCount: 2 }), description: 'Recorded in June', shareCount: 3, likeCount: 1 }
const shared: Album = { ...mine, owner: userSummary('bob', { displayName: 'Bob' }), slug: 'summer', shareCount: undefined, likeCount: undefined }

function serveAlbum(album: Album | 404) {
  server.use(
    http.get(`${API}/albums/a1`, () =>
      album === 404
        ? HttpResponse.json({ statusCode: 404, message: 'x', error: 'Not Found' }, { status: 404 })
        : HttpResponse.json({ album, tracks: { items: [trackSummary('t1', { name: 'Opener' }), trackSummary('t2', { name: 'Closer' })], nextCursor: null } }),
    ),
    http.get(`${API}/albums/a1/recipients`, () => HttpResponse.json({ items: [] })),
    http.get(`${API}/playlists`, () => HttpResponse.json({ items: [], nextCursor: null })),
  )
}

function renderAt(path: string) {
  const result = renderRoutes(
    [
      { path: '/', element: <LocationProbe /> },
      { path: '/albums/:id', element: <AlbumPage albumId="a1" /> },
      { path: '/:username/albums/:slug', element: <AlbumPage albumId="a1" /> },
    ],
    { initialEntries: [path] },
  )
  return { ...result, user: userEvent.setup() }
}

beforeEach(() => serveAlbum(mine))

describe('AlbumPage', () => {
  it('shows the album, its description and tracklist in order', async () => {
    renderAt('/me/albums/summer')
    expect(await screen.findByRole('heading', { name: 'Summer' })).toBeInTheDocument()
    expect(screen.getByText('Recorded in June')).toBeInTheDocument()
    const titles = screen.getAllByRole('link', { name: /Opener|Closer/ }).map((a) => a.textContent)
    expect(titles).toEqual(['Opener', 'Closer'])
  })

  it('moves an old id link to the readable URL', async () => {
    const { router } = renderAt('/albums/a1')
    await screen.findByRole('heading', { name: 'Summer' })
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/me/albums/summer'))
  })

  it('to its owner: Share, how many it is shared with, and Delete album', async () => {
    const { user } = renderAt('/me/albums/summer')
    await screen.findByRole('heading', { name: 'Summer' })

    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
    expect(screen.getByText(/shared with 3 people/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'More album options' }))
    expect(await screen.findByRole('menuitem', { name: 'Delete album' })).toBeInTheDocument()
  })

  it('to someone it was shared with, shows what the owner said when sharing it', async () => {
    serveAlbum({ ...shared, myShare: { sharedAt: Date.now(), caption: 'For the drive' } })
    renderAt('/bob/albums/summer')

    expect(await screen.findByText('FROM BOB')).toBeInTheDocument()
    expect(screen.getByText('“For the drive”')).toBeInTheDocument()
  })

  it('to someone it was shared with: no Share, and they can remove it from their library', async () => {
    serveAlbum(shared)
    let removed = false
    server.use(
      http.delete(`${API}/albums/shared/a1`, () => {
        removed = true
        return HttpResponse.json({})
      }),
    )
    const { user, router } = renderAt('/bob/albums/summer')
    await screen.findByRole('heading', { name: 'Summer' })
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'More album options' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Remove from my library' }))
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Remove Summer?' })).getByRole('button', { name: 'Remove' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(removed).toBe(true)
    expect(sileo.success).toHaveBeenCalledWith({ title: 'Removed from your library', description: 'Summer' })
  })

  it("says it isn't available on a 404", async () => {
    serveAlbum(404)
    renderAt('/albums/a1')
    expect(await screen.findByText("This album isn't available")).toBeInTheDocument()
  })
})
