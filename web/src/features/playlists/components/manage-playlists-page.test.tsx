import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { sileo } from 'sileo'
import { describe, expect, it, vi } from 'vitest'
import type { Playlist } from '@/lib/playlists'
import { renderRoutes } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { ManagePlaylistsPage } from './manage-playlists-page'

vi.mock('@/hooks/use-is-mobile', () => ({ useIsMobile: vi.fn(() => false) }))

const DAY = 86_400_000
const playlist = (id: string, extra: Partial<Playlist>): Playlist => ({
  id,
  name: id,
  description: null,
  type: 'CUSTOM',
  slug: id,
  imageUrl: null,
  imageBgColor: null,
  trackCount: 0,
  totalDurationSeconds: 0,
  createdAt: 0,
  ...extra,
})
const mine = [
  playlist('likes', { name: 'Likes', type: 'LIKES', slug: null, trackCount: 9, createdAt: 99 * DAY }),
  playlist('p1', { name: 'Road trip', trackCount: 4, totalDurationSeconds: 900, createdAt: 3 * DAY, slug: 'road-trip', description: 'For the car' }),
  playlist('p2', { name: 'Gym', createdAt: 2 * DAY, slug: 'gym' }),
  playlist('p3', { name: 'Sleep', trackCount: 12, totalDurationSeconds: 4000, createdAt: 1 * DAY, slug: 'sleep', imageUrl: 'https://x/c.jpg' }),
]
const failure = () => HttpResponse.json({ statusCode: 500, message: 'x', error: 'x' }, { status: 500 })

function renderPage(path = '/playlists', playlists: Playlist[] = mine) {
  server.use(http.get(`${API}/playlists`, () => HttpResponse.json({ items: playlists, nextCursor: null })))
  const result = renderRoutes([{ path: '/playlists', element: <ManagePlaylistsPage /> }], { initialEntries: [path] })
  return { ...result, user: userEvent.setup() }
}

const rows = () => screen.getAllByRole('link', { name: /^(Road trip|Gym|Sleep|Likes)$/ }).map((a) => a.textContent)
const bar = () => screen.getByRole('toolbar', { name: 'Selected playlists' })

describe('ManagePlaylistsPage', () => {
  it('lists the playlists you made (not Liked tracks), newest first', async () => {
    renderPage()
    expect(await screen.findByRole('link', { name: 'Road trip' })).toHaveAttribute('href', '/me/playlists/road-trip')
    expect(rows()).toEqual(['Road trip', 'Gym', 'Sleep'])
    expect(screen.getByText('3 playlists')).toBeInTheDocument()
  })

  it('filters by no tracks, and searches', async () => {
    const { user } = renderPage()
    await screen.findByRole('link', { name: 'Road trip' })

    await user.click(screen.getByRole('button', { name: 'No tracks' }))
    await vi.waitFor(() => expect(rows()).toEqual(['Gym']))

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await user.type(screen.getByLabelText('Search your playlists'), 'sle')
    await vi.waitFor(() => expect(rows()).toEqual(['Sleep']))
  })

  it('reads the sort from the address', async () => {
    renderPage('/playlists?sort=-tracks')
    await screen.findByRole('link', { name: 'Road trip' })
    expect(rows()).toEqual(['Sleep', 'Road trip', 'Gym'])
  })

  it('deletes the selected playlists after a confirm, keeping the ones that failed selected', async () => {
    const deleted: string[] = []
    server.use(
      http.delete(`${API}/playlists/:id`, ({ params }) => {
        if (params.id === 'p2') return failure()
        deleted.push(params.id as string)
        return HttpResponse.json({ message: 'ok' })
      }),
    )
    const { user } = renderPage()
    await screen.findByRole('link', { name: 'Road trip' })
    expect(within(bar()).getByRole('button', { name: 'Delete' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Select Road trip' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Gym' }))
    await user.click(within(bar()).getByRole('button', { name: 'Delete' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 2 playlists?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await vi.waitFor(() =>
      expect(sileo.error).toHaveBeenCalledWith({
        title: "Deleted 1 · 1 couldn't be deleted",
        description: 'The rest are still selected, to try again.',
      }),
    )
    expect(deleted).toEqual(['p1'])
    expect(within(bar()).getByText('1 selected')).toBeInTheDocument()
  })

  it("says so in the dialog when one row's delete fails", async () => {
    server.use(http.delete(`${API}/playlists/:id`, failure))
    const { user } = renderPage()
    await user.click(await screen.findByRole('button', { name: 'More options for Gym' }))
    // Every row's menu is in the page: Gym's is the second
    await user.click((await screen.findAllByRole('menuitem', { name: 'Delete playlist' }))[1])
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Gym?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(await within(dialog).findByText(/Couldn't delete/)).toBeInTheDocument()
    expect(sileo.error).not.toHaveBeenCalled()
  })

  it('opens Edit playlist from the pencil, and New playlist from its button', async () => {
    const { user } = renderPage()
    await user.click(await screen.findByRole('button', { name: 'Edit Road trip' }))
    const edit = await screen.findByRole('dialog', { name: 'Edit playlist' })
    expect(within(edit).getByLabelText(/Description/)).toHaveValue('For the car')
    await user.click(within(edit).getByRole('button', { name: 'Cancel' }))

    await user.click(screen.getByRole('button', { name: 'New playlist' }))
    expect(await screen.findByRole('dialog', { name: 'New playlist' })).toBeInTheDocument()
  })

  it('offers New playlist when you have none of your own', async () => {
    renderPage('/playlists', [mine[0]])
    expect(await screen.findByText('No playlists yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New playlist' })).toBeInTheDocument()
  })
})
