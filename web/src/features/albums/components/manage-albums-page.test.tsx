import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { sileo } from 'sileo'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AlbumEditorContext } from '@/components/albums/album-editor-context'
import { albumSummary, trackSummary, userSummary } from '@/testing/fixtures'
import { renderRoutes } from '@/testing/providers'
import { API, server } from '@/testing/server'
import type { AlbumSummary } from '@/types/api'
import { ManageAlbumsPage } from './manage-albums-page'

vi.mock('@/hooks/use-is-mobile', () => ({ useIsMobile: vi.fn(() => false) }))

const me = userSummary('me')
const DAY = 86_400_000
const mine = [
  albumSummary('a1', { name: 'Summer', trackCount: 5, totalDurationSeconds: 1200, createdAt: 3 * DAY, owner: me, slug: 'summer' }),
  albumSummary('a2', { name: 'Autumn', trackCount: 0, totalDurationSeconds: 0, createdAt: 2 * DAY, owner: me, slug: 'autumn', likedByMe: true }),
  albumSummary('a3', { name: 'Winter', trackCount: 2, totalDurationSeconds: 300, createdAt: 1 * DAY, owner: me, slug: 'winter' }),
]
const failure = () => HttpResponse.json({ statusCode: 500, message: 'x', error: 'x' }, { status: 500 })

const createAlbum = vi.fn()
const editTracks = vi.fn()

function renderPage(path = '/albums', albums: AlbumSummary[] = mine) {
  server.use(http.get(`${API}/albums`, () => HttpResponse.json({ items: albums, nextCursor: null })))
  const result = renderRoutes(
    [
      {
        path: '/albums',
        element: (
          <AlbumEditorContext value={{ create: createAlbum, editTracks }}>
            <ManageAlbumsPage />
          </AlbumEditorContext>
        ),
      },
    ],
    { initialEntries: [path] },
  )
  return { ...result, user: userEvent.setup() }
}

const rows = () => screen.getAllByRole('link', { name: /^(Summer|Autumn|Winter)$/ }).map((a) => a.textContent)
const bar = () => screen.getByRole('toolbar', { name: 'Selected albums' })

beforeEach(() => {
  createAlbum.mockReset()
  editTracks.mockReset()
})

describe('ManageAlbumsPage', () => {
  it('lists your albums newest first, each linking to its page', async () => {
    renderPage()
    expect(await screen.findByRole('link', { name: 'Summer' })).toHaveAttribute('href', '/me/albums/summer')
    expect(rows()).toEqual(['Summer', 'Autumn', 'Winter'])
    expect(screen.getByText('3 albums')).toBeInTheDocument()
    expect(screen.getByText('20 min')).toBeInTheDocument()
  })

  it('sorts by track count and filters to the empty ones', async () => {
    const { user, router } = renderPage()
    await screen.findByRole('link', { name: 'Summer' })

    await user.click(within(screen.getByRole('table')).getByRole('button', { name: /Tracks/ }))
    await vi.waitFor(() => expect(rows()).toEqual(['Autumn', 'Winter', 'Summer']))
    expect(router.state.location.search).toBe('?sort=tracks')

    await user.click(screen.getByRole('button', { name: 'No tracks' }))
    await vi.waitFor(() => expect(rows()).toEqual(['Autumn']))
    expect(screen.getByText('1 of 3 albums')).toBeInTheDocument()
  })

  it('starts a new album', async () => {
    const { user } = renderPage()
    await user.click(await screen.findByRole('button', { name: 'New album' }))
    expect(createAlbum).toHaveBeenCalledWith()
  })

  it('shares the selected albums with the people picked', async () => {
    const bodies: Record<string, unknown> = {}
    server.use(
      http.get(`${API}/users/search`, () => HttpResponse.json({ items: [userSummary('ada', { displayName: 'Ada' })], nextCursor: null })),
      http.post(`${API}/albums/:id/share`, async ({ request, params }) => {
        bodies[params.id as string] = await request.json()
        return HttpResponse.json({ sharedWith: ['ada'] })
      }),
    )
    const { user } = renderPage()
    await user.click(await screen.findByRole('checkbox', { name: 'Select Summer' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Winter' }))
    await user.click(within(bar()).getByRole('button', { name: 'Share' }))

    const dialog = await screen.findByRole('dialog', { name: 'Share 2 albums' })
    await user.type(within(dialog).getByRole('combobox'), 'ada')
    await user.click(await screen.findByRole('option', { name: /Ada/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Share with 1' }))

    await vi.waitFor(() =>
      expect(sileo.success).toHaveBeenCalledWith({ title: 'Shared 2 albums', description: 'With 1 person' }),
    )
    expect(bodies).toEqual({
      a1: { add: ['ada'], remove: [], caption: null },
      a3: { add: ['ada'], remove: [], caption: null },
    })
  })

  it('deletes the selected albums after a confirm, keeping the ones that failed selected', async () => {
    const deleted: string[] = []
    server.use(
      http.delete(`${API}/albums/:id`, ({ params }) => {
        if (params.id === 'a2') return failure()
        deleted.push(params.id as string)
        return HttpResponse.json({})
      }),
    )
    const { user } = renderPage()
    await user.click(await screen.findByRole('checkbox', { name: 'Select Summer' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Autumn' }))
    expect(within(bar()).getByRole('button', { name: 'Delete' })).toBeEnabled()
    await user.click(within(bar()).getByRole('button', { name: 'Delete' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 2 albums?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await vi.waitFor(() =>
      expect(sileo.error).toHaveBeenCalledWith({
        title: "Deleted 1 · 1 couldn't be deleted",
        description: 'The rest are still selected, to try again.',
      }),
    )
    expect(deleted).toEqual(['a1'])
    expect(within(bar()).getByText('1 selected')).toBeInTheDocument()
  })

  it("deletes one album from its row's menu, leaving the selection alone", async () => {
    const deleted: string[] = []
    server.use(
      http.delete(`${API}/albums/:id`, ({ params }) => {
        deleted.push(params.id as string)
        return HttpResponse.json({})
      }),
    )
    const { user } = renderPage()
    await user.click(await screen.findByRole('checkbox', { name: 'Select Summer' }))
    await user.click(screen.getByRole('button', { name: 'More options for Winter' }))
    // Every row's menu is in the page: Winter's is the third
    await user.click((await screen.findAllByRole('menuitem', { name: 'Delete album' }))[2])

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Winter?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await vi.waitFor(() => expect(sileo.success).toHaveBeenCalledWith({ title: 'Deleted 1 album', description: undefined }))
    expect(deleted).toEqual(['a3'])
    expect(within(bar()).getByText('1 selected')).toBeInTheDocument()
  })

  it('opens Edit tracks with the whole album', async () => {
    const tracks = [trackSummary('t1'), trackSummary('t2')]
    server.use(
      http.get(`${API}/albums/a1`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        return HttpResponse.json({
          album: { ...mine[0], description: null, shareCount: 2 },
          tracks: { items: [tracks[cursor ? 1 : 0]], nextCursor: cursor ? null : 'p2' },
        })
      }),
    )
    const { user } = renderPage()
    await user.click(await screen.findByRole('button', { name: 'More options for Summer' }))
    await user.click((await screen.findAllByRole('menuitem', { name: 'Edit tracks' }))[0])

    await vi.waitFor(() => expect(editTracks).toHaveBeenCalled())
    const [album, load] = editTracks.mock.calls[0]
    expect(album).toMatchObject({ id: 'a1', shareCount: 2 })
    expect((await load()).map((t: { id: string }) => t.id)).toEqual(['t1', 't2'])
  })

  it('opens Edit album for one album from its pencil', async () => {
    server.use(
      http.get(`${API}/albums/a1`, () =>
        HttpResponse.json({ album: { ...mine[0], description: 'Warm ones', shareCount: 0 }, tracks: { items: [], nextCursor: null } }),
      ),
    )
    const { user } = renderPage()
    await user.click(await screen.findByRole('button', { name: 'Edit Summer' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit album' })
    expect(within(dialog).getByLabelText(/Description/)).toHaveValue('Warm ones')
  })

  it('offers New album when you have none', async () => {
    renderPage('/albums', [])
    expect(await screen.findByText('No albums yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New album' })).toBeInTheDocument()
  })
})
