import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { sileo } from 'sileo'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AlbumEditorContext } from '@/components/albums/album-editor-context'
import { trackSummary, userSummary } from '@/testing/fixtures'
import { renderRoutes } from '@/testing/providers'
import { API, server } from '@/testing/server'
import type { TrackSummary } from '@/types/api'
import type { PendingUpload } from '../api/upload'
import { ManageTracksPage } from './manage-tracks-page'

vi.mock('@/hooks/use-is-mobile', () => ({ useIsMobile: vi.fn(() => false) }))

const me = userSummary('me')
const DAY = 86_400_000
const mine = [
  trackSummary('t1', { name: 'Banana', duration: 300, createdAt: 3 * DAY, owner: me, slug: 'banana' }),
  trackSummary('t2', { name: 'apple', duration: 100, createdAt: 2 * DAY, owner: me, slug: 'apple' }),
  trackSummary('t3', { name: 'Cherry', duration: 200, createdAt: 1 * DAY, owner: me, slug: 'cherry' }),
]
const playlist = { id: 'p1', name: 'Road trip', type: 'CUSTOM', slug: 'road-trip', description: null, imageUrl: null, imageBgColor: null, trackCount: 0, totalDurationSeconds: 0, createdAt: 0 }
const failure = () => HttpResponse.json({ statusCode: 500, message: 'x', error: 'x' }, { status: 500 })

const createAlbum = vi.fn()

function renderPage(path = '/tracks', tracks: TrackSummary[] = mine, uploads: PendingUpload[] = []) {
  server.use(
    http.get(`${API}/tracks`, () => HttpResponse.json({ items: tracks, nextCursor: null })),
    http.get(`${API}/tracks/uploads`, () => HttpResponse.json({ items: uploads })),
    http.get(`${API}/playlists`, () => HttpResponse.json({ items: [playlist], nextCursor: null })),
  )
  const result = renderRoutes(
    [
      {
        path: '/tracks',
        element: (
          <AlbumEditorContext value={{ create: createAlbum, editTracks: () => {} }}>
            <ManageTracksPage />
          </AlbumEditorContext>
        ),
      },
    ],
    { initialEntries: [path] },
  )
  return { ...result, user: userEvent.setup() }
}

/** The track names in the table, top to bottom. */
const rows = () => screen.getAllByRole('link', { name: /^(Banana|apple|Cherry|Track \d+)$/ }).map((a) => a.textContent)
const bar = () => screen.getByRole('toolbar', { name: 'Selected tracks' })

beforeEach(() => createAlbum.mockReset())

describe('ManageTracksPage', () => {
  it('lists your tracks newest first, each linking to its page', async () => {
    renderPage()
    expect(await screen.findByRole('link', { name: 'Banana' })).toHaveAttribute('href', '/me/banana')
    expect(rows()).toEqual(['Banana', 'apple', 'Cherry'])
    expect(screen.getByText('5:00')).toBeInTheDocument()
  })

  it('pins uploads still processing or failed above your tracks, untickable and uncounted', async () => {
    let uploads: PendingUpload[] = [
      { trackId: 'u1', name: 'Still going', status: 'PROCESSING', createdAt: 5 * DAY },
      { trackId: 'u2', name: 'Broken', status: 'FAILED', error: 'That file is not audio.', createdAt: 4 * DAY },
    ]
    const dismissed = vi.fn()
    const { user } = renderPage('/tracks?sort=name', mine)
    server.use(
      http.get(`${API}/tracks/uploads`, () => HttpResponse.json({ items: uploads })),
      http.delete(`${API}/tracks/uploads/u2`, () => {
        dismissed()
        uploads = uploads.filter((u) => u.trackId !== 'u2')
        return HttpResponse.json({})
      }),
    )
    await screen.findByText('Still going')

    const names = screen.getAllByRole('row').slice(1).map((row) => row.textContent)
    expect(names[0]).toContain('Still going')
    expect(names[0]).toContain('Processing')
    expect(names[1]).toContain('Broken')
    expect(names[1]).toContain('Upload failed')
    expect(names[2]).toContain('apple') // then your tracks, in the chosen order
    expect(screen.getByText('3 tracks')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Select Still going' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Select Broken' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dismiss Still going' })).not.toBeInTheDocument()

    // A failed one clears with ✕ (straight away)
    await user.click(screen.getByRole('button', { name: 'Dismiss Broken' }))
    await vi.waitFor(() => expect(screen.queryByText('Broken')).not.toBeInTheDocument())
    expect(dismissed).toHaveBeenCalledOnce()
  })

  it('shows a first upload processing instead of "No tracks yet"', async () => {
    renderPage('/tracks', [], [{ trackId: 'u1', name: 'First one', status: 'PROCESSING', createdAt: 1 }])
    expect(await screen.findByText('First one')).toBeInTheDocument()
    expect(screen.queryByText('No tracks yet')).not.toBeInTheDocument()
  })

  it('sorts by a column, keeping the choice in the address', async () => {
    const { user, router } = renderPage()
    await screen.findByRole('link', { name: 'Banana' })

    await user.click(within(screen.getByRole('table')).getByRole('button', { name: /Track/ }))
    expect(rows()).toEqual(['apple', 'Banana', 'Cherry'])
    expect(router.state.location.search).toBe('?sort=name')

    await user.click(within(screen.getByRole('table')).getByRole('button', { name: /Track/ }))
    expect(rows()).toEqual(['Cherry', 'Banana', 'apple'])
    expect(router.state.location.search).toBe('?sort=-name')
  })

  it('reads the sort and search from the address', async () => {
    renderPage('/tracks?sort=length&q=an')
    await screen.findByRole('link', { name: 'Banana' })
    expect(rows()).toEqual(['Banana'])
    expect(screen.getByLabelText('Search your tracks')).toHaveValue('an')
  })

  it('searches by name, and says when nothing matches', async () => {
    const { user } = renderPage()
    await screen.findByRole('link', { name: 'Banana' })

    await user.type(screen.getByLabelText('Search your tracks'), 'APP')
    expect(rows()).toEqual(['apple'])

    await user.type(screen.getByLabelText('Search your tracks'), 'zzz')
    expect(screen.getByText('Nothing matches “APPzzz” with these filters.')).toBeInTheDocument()
  })

  it('counts what a filter leaves, and clears it from the address', async () => {
    const now = Date.now()
    const { user, router } = renderPage('/tracks?uploaded=month', [
      trackSummary('t1', { name: 'Banana', duration: 500, createdAt: now - DAY, owner: me }),
      trackSummary('t2', { name: 'apple', duration: 60, createdAt: now - 20 * DAY, owner: me }),
      trackSummary('t3', { name: 'Cherry', duration: 200, createdAt: now - 400 * DAY, owner: me }),
    ])
    await screen.findByRole('link', { name: 'Banana' })
    expect(rows()).toEqual(['Banana', 'apple'])
    expect(screen.getByText('2 of 3 tracks')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await vi.waitFor(() => expect(rows()).toEqual(['Banana', 'apple', 'Cherry']))
    expect(router.state.location.search).toBe('')
  })

  it('reads the date and length filters from the address', async () => {
    const now = Date.now()
    const tracks = [
      trackSummary('t1', { name: 'Banana', duration: 500, createdAt: now - DAY, owner: me }),
      trackSummary('t2', { name: 'apple', duration: 60, createdAt: now - 20 * DAY, owner: me }),
      trackSummary('t3', { name: 'Cherry', duration: 200, createdAt: now - 400 * DAY, owner: me }),
    ]
    const first = renderPage('/tracks?uploaded=month', tracks)
    await screen.findByRole('link', { name: 'Banana' })
    expect(rows()).toEqual(['Banana', 'apple'])
    first.unmount()

    renderPage('/tracks?length=medium', tracks)
    await screen.findByRole('link', { name: 'Cherry' })
    expect(rows()).toEqual(['Cherry'])
  })

  it('keeps the bulk bar in place, off until something is ticked', async () => {
    const { user } = renderPage()
    await screen.findByRole('link', { name: 'Banana' })
    for (const name of ['Add to playlist', 'New album from selected', 'Share', 'Delete'])
      expect(within(bar()).getByRole('button', { name })).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: 'Select Banana' }))
    expect(within(bar()).getByRole('button', { name: 'Delete' })).toBeEnabled()
    await user.click(within(bar()).getByRole('button', { name: 'Unselect all' }))
    expect(within(bar()).getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('pages through them, and a selection survives changing page', async () => {
    const many = Array.from({ length: 30 }, (_, i) => trackSummary(String(i + 1), { owner: me, createdAt: (40 - i) * DAY }))
    const { user, router } = renderPage('/tracks', many)
    await screen.findByRole('link', { name: 'Track 1' })
    expect(rows()).toHaveLength(25)

    await user.click(screen.getByRole('checkbox', { name: 'Select Track 1' }))
    await user.click(within(screen.getByRole('navigation', { name: 'Pages of your tracks' })).getByRole('button', { name: 'Go to next page' }))
    await vi.waitFor(() => expect(rows()).toEqual(['Track 26', 'Track 27', 'Track 28', 'Track 29', 'Track 30']))
    expect(router.state.location.search).toBe('?page=2')
    await user.click(screen.getByRole('checkbox', { name: 'Select Track 30' }))

    expect(within(bar()).getByText('2 selected')).toBeInTheDocument()
  })

  it('adds the selected tracks to a playlist', async () => {
    const added: string[] = []
    server.use(
      http.post(`${API}/playlists/p1/tracks/:id`, ({ params }) => {
        added.push(params.id as string)
        return HttpResponse.json({ trackId: params.id, added: true })
      }),
    )
    const { user } = renderPage()
    await user.click(await screen.findByRole('checkbox', { name: 'Select Banana' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Cherry' }))

    await user.click(within(bar()).getByRole('button', { name: 'Add to playlist' }))
    // The bar's menu comes first; each row's ⋯ menu lists the playlist too
    await user.click((await screen.findAllByRole('menuitem', { name: 'Road trip' }))[0])

    await vi.waitFor(() =>
      expect(sileo.success).toHaveBeenCalledWith({ title: 'Added 2 tracks', description: 'Road trip' }),
    )
    expect(added).toEqual(['t1', 't3'])
    // Nothing left selected: the bar stays, its buttons off again
    expect(within(bar()).queryByText(/\d selected/)).not.toBeInTheDocument()
    expect(within(bar()).getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('starts a new album from the selection, in the order shown', async () => {
    const { user } = renderPage()
    await user.click(await screen.findByRole('checkbox', { name: 'Select Cherry' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Banana' }))
    await user.click(within(bar()).getByRole('button', { name: 'New album from selected' }))
    expect(createAlbum.mock.calls[0][0].map((t: TrackSummary) => t.id)).toEqual(['t1', 't3'])
  })

  it('shares the selected tracks with the people picked', async () => {
    const bodies: Record<string, unknown> = {}
    server.use(
      http.get(`${API}/users/search`, () => HttpResponse.json({ items: [userSummary('ada', { displayName: 'Ada' })], nextCursor: null })),
      http.post(`${API}/tracks/:id/share`, async ({ request, params }) => {
        bodies[params.id as string] = await request.json()
        return HttpResponse.json({ sharedWith: ['ada'] })
      }),
    )
    const { user } = renderPage()
    await user.click(await screen.findByRole('checkbox', { name: 'Select Banana' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select apple' }))
    await user.click(within(bar()).getByRole('button', { name: 'Share' }))

    const dialog = await screen.findByRole('dialog', { name: 'Share 2 tracks' })
    expect(within(dialog).getByRole('button', { name: 'Share' })).toBeDisabled()
    await user.type(within(dialog).getByRole('combobox'), 'ada')
    await user.click(await screen.findByRole('option', { name: /Ada/ }))
    await user.type(within(dialog).getByLabelText(/Caption/), 'new ones')
    await user.click(within(dialog).getByRole('button', { name: 'Share with 1' }))

    await vi.waitFor(() =>
      expect(sileo.success).toHaveBeenCalledWith({ title: 'Shared 2 tracks', description: 'With 1 person' }),
    )
    expect(bodies).toEqual({
      t1: { add: ['ada'], remove: [], caption: 'new ones' },
      t2: { add: ['ada'], remove: [], caption: 'new ones' },
    })
  })

  it('deletes the selected tracks after a confirm, keeping the ones that failed selected', async () => {
    const deleted: string[] = []
    server.use(
      http.delete(`${API}/tracks/:id`, ({ params }) => {
        if (params.id === 't2') return failure()
        deleted.push(params.id as string)
        return HttpResponse.json({})
      }),
    )
    const { user } = renderPage()
    await user.click(await screen.findByRole('checkbox', { name: 'Select Banana' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select apple' }))
    await user.click(within(bar()).getByRole('button', { name: 'Delete' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 2 tracks?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await vi.waitFor(() =>
      expect(sileo.error).toHaveBeenCalledWith({
        title: "Deleted 1 · 1 couldn't be deleted",
        description: 'The rest are still selected, to try again.',
      }),
    )
    expect(deleted).toEqual(['t1'])
    expect(within(bar()).getByText('1 selected')).toBeInTheDocument()
  })

  it('says so in the dialog when nothing could be deleted', async () => {
    server.use(http.delete(`${API}/tracks/:id`, failure))
    const { user } = renderPage()
    await user.click(await screen.findByRole('checkbox', { name: 'Select Banana' }))
    await user.click(within(bar()).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Banana?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(await within(dialog).findByText(/Couldn't delete them/)).toBeInTheDocument()
    expect(sileo.error).not.toHaveBeenCalled()
  })

  it('opens the edit dialog for one track from its pencil', async () => {
    server.use(http.get(`${API}/tracks/t1`, () => HttpResponse.json({ ...mine[0], description: 'Ripe', genre: 'Fruit' })))
    const { user } = renderPage()
    await user.click(await screen.findByRole('button', { name: 'Edit Banana' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit track' })
    // Not on the genre list: Other, with it typed in
    expect(within(dialog).getByRole('textbox', { name: /Your genre/ })).toHaveValue('Fruit')
  })

  it('offers Upload when you have no tracks', async () => {
    renderPage('/tracks', [])
    expect(await screen.findByText('No tracks yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload track' })).toBeInTheDocument()
  })
})
