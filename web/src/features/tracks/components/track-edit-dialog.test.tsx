import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { sileo } from 'sileo'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { startDownload } from '@/lib/download'
import { trackSummary, userSummary } from '@/testing/fixtures'
import { LocationProbe, renderRoutes } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { captureBodies } from '@/testing/stage-upload'
import type { Track } from '../api/tracks'
import { TrackPage } from './track-page'

vi.mock('@/lib/download', () => ({ startDownload: vi.fn() }))
vi.mock('@/hooks/use-is-mobile', () => ({ useIsMobile: vi.fn(() => false) }))

const mine: Track = {
  ...trackSummary('t1', { name: 'My Song', slug: 'my-song', duration: 185, owner: userSummary('me', { displayName: 'Me' }) }),
  genre: 'Indie',
  description: 'Line one',
  likeCount: 2,
  shareCount: 1,
}

function serveTrack(track: Track) {
  server.use(
    http.get(`${API}/tracks/t1`, () => HttpResponse.json(track)),
    http.get(`${API}/tracks/t1/recipients`, () => HttpResponse.json({ items: [] })),
    http.get(`${API}/tracks/t1/likes`, () => HttpResponse.json({ items: [], nextCursor: null })),
    http.get(`${API}/tracks/t1/appears-in`, () => HttpResponse.json({ albums: [], playlists: [] })),
    http.get(`${API}/playlists`, () => HttpResponse.json({ items: [], nextCursor: null })),
  )
}

// The track page, or its /edit address (the same page with the dialog open)
function renderAt(path = '/me/my-song') {
  const result = renderRoutes(
    [
      { path: '/:username', element: <LocationProbe /> },
      { path: '/:username/:slug', element: <TrackPage trackId="t1" /> },
      { path: '/:username/:slug/edit', element: <TrackPage trackId="t1" isEditing /> },
      { path: '/tracks/:id/edit', element: <TrackPage trackId="t1" isEditing /> },
    ],
    { initialEntries: [path] },
  )
  return { ...result, user: userEvent.setup() }
}

const editDialog = () => screen.findByRole('dialog', { name: 'Edit track' })
const field = (label: string | RegExp) => screen.getByLabelText(label)

beforeEach(() => serveTrack(mine))

describe('Edit track dialog', () => {
  it('opens from the track page: the track as it looks, its details, Save waiting for a change', async () => {
    const { user } = renderAt()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const dialog = await editDialog()
    const preview = within(dialog).getByRole('complementary', { name: 'Preview' })
    expect(within(preview).getByRole('heading', { name: 'My Song' })).toBeInTheDocument()
    expect(within(preview).getByText(/3:05 · Uploaded/)).toBeInTheDocument()
    expect(field('Name')).toHaveValue('My Song')
    expect(within(dialog).getByRole('button', { name: /^Genre/ })).toHaveTextContent('Indie')
    expect(field('URL')).toHaveValue('my-song')
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('the preview follows the name as you type it', async () => {
    const { user } = renderAt('/me/my-song/edit')
    const dialog = await editDialog()
    await user.clear(field('Name'))
    await user.type(field('Name'), 'New Name')
    expect(within(within(dialog).getByRole('complementary', { name: 'Preview' })).getByRole('heading', { name: 'New Name' })).toBeInTheDocument()
  })

  it('an /edit address opens it over the track; closing moves on to the track', async () => {
    const { user, router } = renderAt('/me/my-song/edit')
    const dialog = await editDialog()
    expect(router.state.location.pathname).toBe('/me/my-song/edit')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/me/my-song'))
    expect(screen.queryByRole('dialog', { name: 'Edit track' })).not.toBeInTheDocument()
  })

  it("isn't offered to anyone but its owner", async () => {
    serveTrack({ ...mine, owner: userSummary('bob'), likeCount: undefined, shareCount: undefined })
    renderAt('/bob/my-song/edit')
    await screen.findByRole('heading', { name: 'My Song' })
    expect(screen.queryByRole('dialog', { name: 'Edit track' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('saves name, genre and description, closes, then says so', async () => {
    const bodies = captureBodies('put', '/tracks/t1', { ...mine, name: 'New Name' })
    const { user } = renderAt('/me/my-song/edit')
    await editDialog()
    await user.clear(field('Name'))
    await user.type(field('Name'), 'New Name')
    await user.clear(field(/Description/))
    await user.type(field(/Description/), 'Some words')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await vi.waitFor(() =>
      expect(bodies).toEqual([{ name: 'New Name', genre: 'Indie', description: 'Some words', clearedImage: false }]),
    )
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit track' })).not.toBeInTheDocument())
    expect(sileo.success).toHaveBeenCalledWith({ title: 'Saved', description: 'New Name' })
  })

  it('sends a changed URL', async () => {
    const bodies = captureBodies('put', '/tracks/t1', mine)
    const { user } = renderAt('/me/my-song/edit')
    await editDialog()
    await user.clear(field('URL'))
    await user.type(field('URL'), 'Better Name')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await vi.waitFor(() => expect(bodies[0]?.slug).toBe('better-name'))
  })

  it("shows the API's reason in the dialog when it won't save", async () => {
    server.use(
      http.put(`${API}/tracks/t1`, () =>
        HttpResponse.json({ statusCode: 400, message: 'You already use that URL.', error: 'Bad Request' }, { status: 400 }),
      ),
    )
    const { user } = renderAt('/me/my-song/edit')
    const dialog = await editDialog()
    await user.type(field('Name'), '!')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(await within(dialog).findByText('You already use that URL.')).toBeInTheDocument()
  })

  it('has no URL field for a track made before readable URLs', async () => {
    serveTrack({ ...mine, slug: null })
    renderAt('/tracks/t1/edit')
    await editDialog()
    expect(screen.queryByLabelText('URL')).not.toBeInTheDocument()
  })

  it('asks before closing with unsaved changes', async () => {
    const { user } = renderAt('/me/my-song/edit')
    const dialog = await editDialog()
    await user.type(field('Name'), ' 2')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Discard changes?' })
    await user.click(within(confirm).getByRole('button', { name: 'Discard' }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit track' })).not.toBeInTheDocument())
  })

  it("cancelling the cover picker leaves the dialog open", async () => {
    renderAt('/me/my-song/edit')
    const dialog = await editDialog()
    dialog.querySelector('input[type="file"]')!.dispatchEvent(new Event('cancel', { bubbles: true }))
    expect(screen.getByRole('dialog', { name: 'Edit track' })).toBeInTheDocument()
  })

  it('downloads the original from its own button in the footer', async () => {
    server.use(
      http.get(`${API}/tracks/t1/original`, () =>
        HttpResponse.json({ url: 'https://s3.test/original', fileName: 'My Song.wav', contentType: 'audio/wav', expiresAt: 1 }),
      ),
    )
    const { user } = renderAt('/me/my-song/edit')
    const dialog = await editDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Download original' }))
    await vi.waitFor(() => expect(startDownload).toHaveBeenCalledWith('https://s3.test/original'))
  })
})
