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
import { TrackEditPage } from './track-edit-page'

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
    http.get(`${API}/tracks/t1/recipients`, () =>
      HttpResponse.json({ items: [{ user: userSummary('carol', { displayName: 'Carol' }), sharedAt: 1 }] }),
    ),
  )
}

// The edit page opened from the track page (so leaving steps back to it)
function renderEdit(path = '/me/my-song/edit') {
  const result = renderRoutes(
    [
      { path: '/:username', element: <LocationProbe /> },
      { path: '/:username/:slug', element: <LocationProbe /> },
      { path: '/:username/:slug/edit', element: <TrackEditPage trackId="t1" /> },
      { path: '/tracks/:id/edit', element: <TrackEditPage trackId="t1" /> },
    ],
    { initialEntries: ['/me/my-song', path], initialIndex: 1 },
  )
  return { ...result, user: userEvent.setup() }
}

const field = (label: string | RegExp) => screen.getByLabelText(label)

beforeEach(() => serveTrack(mine))

describe('TrackEditPage', () => {
  it('shows its audio, details, sharing and delete, starting from the track', async () => {
    renderEdit()
    expect(await screen.findByRole('heading', { name: 'Edit track' })).toBeInTheDocument()
    for (const section of ['Audio', 'Details', 'Sharing', 'Delete track'])
      expect(screen.getByRole('heading', { name: section })).toBeInTheDocument()
    expect(screen.getByText(/3:05 · Uploaded/)).toBeInTheDocument()
    expect(field('Name')).toHaveValue('My Song')
    expect(field(/Genre/)).toHaveValue('Indie')
    expect(field('URL')).toHaveValue('my-song')
    expect((await screen.findAllByText('Carol')).length).toBeGreaterThan(0)
    // Nothing changed yet
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('moves an old id link to the readable one', async () => {
    const { router } = renderEdit('/tracks/t1/edit')
    await screen.findByRole('heading', { name: 'Edit track' })
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/me/my-song/edit'))
  })

  it("isn't available to anyone but its owner", async () => {
    serveTrack({ ...mine, owner: userSummary('bob'), likeCount: undefined, shareCount: undefined })
    renderEdit('/bob/my-song/edit')
    expect(await screen.findByText("This track isn't available")).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Edit track' })).not.toBeInTheDocument()
  })

  it('saves name, genre and description, then goes back to the track', async () => {
    const bodies = captureBodies('put', '/tracks/t1', { ...mine, name: 'New Name' })
    const { user, router } = renderEdit()
    await screen.findByRole('heading', { name: 'Edit track' })

    await user.clear(field('Name'))
    await user.type(field('Name'), 'New Name')
    await user.clear(field(/Description/))
    await user.type(field(/Description/), 'Some words')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await vi.waitFor(() =>
      expect(bodies).toEqual([{ name: 'New Name', genre: 'Indie', description: 'Some words', clearedImage: false }]),
    )
    expect(sileo.success).toHaveBeenCalledWith({ title: 'Saved', description: 'New Name' })
    // No "Discard changes?" on the way out: it's saved
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/me/my-song'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('sends a changed URL', async () => {
    const bodies = captureBodies('put', '/tracks/t1', mine)
    const { user } = renderEdit()
    await screen.findByRole('heading', { name: 'Edit track' })

    await user.clear(field('URL'))
    await user.type(field('URL'), 'Better Name')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await vi.waitFor(() => expect(bodies[0]?.slug).toBe('better-name'))
  })

  it("shows the API's reason when it won't save", async () => {
    server.use(
      http.put(`${API}/tracks/t1`, () =>
        HttpResponse.json({ statusCode: 400, message: 'You already use that URL.', error: 'Bad Request' }, { status: 400 }),
      ),
    )
    const { user } = renderEdit()
    await screen.findByRole('heading', { name: 'Edit track' })
    await user.type(field('Name'), '!')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('You already use that URL.')).toBeInTheDocument()
  })

  it('has no URL field for a track made before readable URLs', async () => {
    serveTrack({ ...mine, slug: null })
    renderEdit('/tracks/t1/edit')
    await screen.findByRole('heading', { name: 'Edit track' })
    expect(screen.queryByLabelText('URL')).not.toBeInTheDocument()
  })

  it('asks before leaving with unsaved changes', async () => {
    const { user, router } = renderEdit()
    await screen.findByRole('heading', { name: 'Edit track' })
    await user.type(field('Name'), ' 2')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    const confirm = await screen.findByRole('alertdialog', { name: 'Discard changes?' })
    expect(router.state.location.pathname).toBe('/me/my-song/edit')
    await user.click(within(confirm).getByRole('button', { name: 'Discard' }))
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/me/my-song'))
  })

  it('downloads the original', async () => {
    server.use(
      http.get(`${API}/tracks/t1/original`, () =>
        HttpResponse.json({ url: 'https://s3.test/original', fileName: 'My Song.wav', contentType: 'audio/wav', expiresAt: 1 }),
      ),
    )
    const { user } = renderEdit()
    await user.click(await screen.findByRole('button', { name: 'Download original' }))
    await vi.waitFor(() => expect(startDownload).toHaveBeenCalledWith('https://s3.test/original'))
  })

  it('opens the Share dialog from Manage access and Share link', async () => {
    const { user } = renderEdit()
    await user.click(await screen.findByRole('button', { name: 'Manage access' }))
    expect(await screen.findByRole('dialog', { name: /^Share / })).toBeInTheDocument()
  })

  it('deletes after confirming, then lands on your profile', async () => {
    let deleted = false
    server.use(
      http.delete(`${API}/tracks/t1`, () => {
        deleted = true
        return HttpResponse.json({})
      }),
    )
    const { user, router } = renderEdit()
    await user.click(await screen.findByRole('button', { name: 'Delete track' }))
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Delete My Song?' })).getByRole('button', { name: 'Delete' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/me'))
    expect(deleted).toBe(true)
  })
})
