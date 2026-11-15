import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { sileo } from 'sileo'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as mobile from '@/hooks/use-is-mobile'
import { startDownload } from '@/lib/download'
import { albumSummary, trackSummary, userSummary } from '@/testing/fixtures'
import { LocationProbe, renderRoutes } from '@/testing/providers'
import { API, server } from '@/testing/server'
import type { Track, TrackAppearsIn } from '../api/tracks'
import { TrackPage } from './track-page'

vi.mock('@/lib/download', () => ({ startDownload: vi.fn() }))
vi.mock('@/hooks/use-is-mobile', () => ({ useIsMobile: vi.fn(() => false) }))

const mine: Track = {
  ...trackSummary('t1', { name: 'My Song', slug: 'my-song', owner: userSummary('me', { displayName: 'Me' }) }),
  genre: 'Indie',
  description: 'Line one\nLine two',
  likeCount: 2,
  shareCount: 1,
}
const theirs: Track = { ...mine, owner: userSummary('bob', { displayName: 'Bob' }), slug: 'their-song', likeCount: undefined, shareCount: undefined }

function serveTrack(track: Track | 404, appearsIn: TrackAppearsIn = { albums: [], playlists: [] }) {
  server.use(
    http.get(`${API}/tracks/t1/appears-in`, () => HttpResponse.json(appearsIn)),
    http.get(`${API}/tracks/t1`, () =>
      track === 404 ? HttpResponse.json({ statusCode: 404, message: 'x', error: 'Not Found' }, { status: 404 }) : HttpResponse.json(track),
    ),
    http.get(`${API}/tracks/t1/recipients`, () => HttpResponse.json({ items: [{ user: userSummary('carol', { displayName: 'Carol' }), sharedAt: 1 }] })),
    http.get(`${API}/tracks/t1/likes`, () =>
      HttpResponse.json({ items: [{ user: userSummary('dan', { displayName: 'Dan' }), likedAt: 1 }, { user: userSummary('eve'), likedAt: 1 }], nextCursor: null }),
    ),
    http.get(`${API}/playlists`, () => HttpResponse.json({ items: [], nextCursor: null })),
  )
}

function renderAt(path: string) {
  const result = renderRoutes(
    [
      { path: '/', element: <LocationProbe /> },
      { path: '/tracks/:id', element: <TrackPage trackId="t1" /> },
      { path: '/:username/:slug', element: <TrackPage trackId="t1" /> },
    ],
    { initialEntries: [path] },
  )
  return { ...result, user: userEvent.setup() }
}

beforeEach(() => serveTrack(mine))

describe('TrackPage', () => {
  it("shows the track's details", async () => {
    renderAt('/me/my-song')
    expect(await screen.findByRole('heading', { name: 'My Song' })).toBeInTheDocument()
    expect(screen.getByText('Indie')).toBeInTheDocument()
    expect(screen.getByText(/Line one/)).toBeInTheDocument()
  })

  it('moves an old id link to the readable URL once loaded', async () => {
    const { router } = renderAt('/tracks/t1')
    await screen.findByRole('heading', { name: 'My Song' })
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/me/my-song'))
  })

  it('to its owner: Share, who it is shared with, and who liked it', async () => {
    renderAt('/me/my-song')
    await screen.findByRole('heading', { name: 'My Song' })

    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
    // (people can also appear in the header's avatar stack)
    expect((await screen.findAllByText('Carol')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('Dan')).length).toBeGreaterThan(0)
  })

  it('to someone it was shared with: no Share, no owner sections, and Remove from my library', async () => {
    serveTrack(theirs)
    const { user } = renderAt('/bob/their-song')
    await screen.findByRole('heading', { name: 'My Song' })

    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument()
    expect(screen.queryByText('Carol')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'More options for My Song' }))
    expect(await screen.findByRole('menuitem', { name: 'Remove from my library' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Delete track' })).not.toBeInTheDocument()
  })

  it('to someone it was shared with, what the owner said when sharing it comes first', async () => {
    serveTrack({ ...theirs, myShare: { sharedAt: Date.now() - 3 * 86_400_000, caption: 'Play this loud' } })
    renderAt('/bob/their-song')

    expect(await screen.findByText('FROM BOB')).toBeInTheDocument()
    expect(screen.getByText('“Play this loud”')).toBeInTheDocument()
    expect(screen.getByText(/^Shared/)).toBeInTheDocument()
  })

  it('shows no note when the share had no caption', async () => {
    serveTrack({ ...theirs, myShare: { sharedAt: 1 } })
    renderAt('/bob/their-song')
    await screen.findByText('GENRE')
    expect(screen.queryByText('FROM BOB')).not.toBeInTheDocument()
  })

  it('shows the albums it is in and your playlists that hold it', async () => {
    serveTrack(theirs, {
      albums: [albumSummary('a1', { name: 'Late Shift', owner: theirs.owner })],
      playlists: [
        {
          id: 'p1',
          name: 'Road trip',
          description: null,
          type: 'CUSTOM',
          slug: 'road-trip',
          imageUrl: null,
          imageBgColor: null,
          trackCount: 3,
          totalDurationSeconds: 540,
          createdAt: 1,
        },
      ],
    })
    renderAt('/bob/their-song')

    expect(await screen.findByText('IN ALBUMS')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Late Shift/ })).toBeInTheDocument()
    expect(screen.getByText('IN YOUR PLAYLISTS')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Road trip/ })).toHaveAttribute('href', '/me/playlists/road-trip')
  })

  it('leaves both out when it is in none', async () => {
    renderAt('/me/my-song')
    await screen.findByText('GENRE')
    expect(screen.queryByText('IN ALBUMS')).not.toBeInTheDocument()
    expect(screen.queryByText('IN YOUR PLAYLISTS')).not.toBeInTheDocument()
  })

  it('deletes after confirming, then leaves for Home', async () => {
    let deleted = false
    server.use(
      http.delete(`${API}/tracks/t1`, () => {
        deleted = true
        return HttpResponse.json({})
      }),
    )
    const { user, router } = renderAt('/me/my-song')
    await screen.findByRole('heading', { name: 'My Song' })

    await user.click(screen.getByRole('button', { name: 'More options for My Song' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete track' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete My Song?' })
    expect(deleted).toBe(false)
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(deleted).toBe(true)
    expect(sileo.success).toHaveBeenCalledWith({ title: 'Track deleted', description: 'My Song' })
  })

  it('gives its owner an Edit button, to the Edit track page', async () => {
    const { user } = renderAt('/me/my-song')
    await screen.findByRole('heading', { name: 'My Song' })
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/me/my-song/edit')
    await user.click(screen.getByRole('button', { name: 'More options for My Song' }))
    expect(await screen.findByRole('menuitem', { name: 'Edit track' })).toHaveAttribute('href', '/me/my-song/edit')
  })

  it('has no Edit for someone it was shared with', async () => {
    serveTrack(theirs)
    renderAt('/bob/their-song')
    await screen.findByRole('heading', { name: 'My Song' })
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('stays put and says so when deleting fails', async () => {
    server.use(http.delete(`${API}/tracks/t1`, () => HttpResponse.json({}, { status: 500 })))
    const { user, router } = renderAt('/me/my-song')
    await screen.findByRole('heading', { name: 'My Song' })

    await user.click(screen.getByRole('button', { name: 'More options for My Song' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete track' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }))

    // Said in the confirmation itself, which stays open (a toast would sit behind it)
    expect(await screen.findByText("Couldn't delete the track. Check your connection and try again.")).toBeInTheDocument()
    expect(sileo.error).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/me/my-song')
  })

  describe("the owner's who-has-it avatars beside the buttons", () => {
    const avatars = () => screen.queryByRole('button', { name: /Shared with .* — manage access/ })

    it('show on wider screens and open Manage access', async () => {
      const { user } = renderAt('/me/my-song')
      await user.click(await screen.findByRole('button', { name: 'Shared with Carol — manage access' }))
      expect(await screen.findByRole('dialog', { name: /^Share / })).toBeInTheDocument()
    })

    // Phones: the row needs its whole width for Play, Share, like and ⋯ (the avatars squashed
    // and pushed ⋯ onto its own line); "shared with N" is in the details line anyway
    it('are left out on phones, keeping the buttons on one row', async () => {
      vi.mocked(mobile.useIsMobile).mockReturnValue(true)
      renderAt('/me/my-song')
      await screen.findByRole('heading', { name: 'My Song' })
      await screen.findAllByText('Carol') // the Shared with section below still lists them

      expect(avatars()).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'More options for My Song' })).toBeInTheDocument()
      vi.mocked(mobile.useIsMobile).mockReturnValue(false)
    })
  })

  it('lets its owner download the original upload from the menu', async () => {
    server.use(
      http.get(`${API}/tracks/t1/original`, () =>
        HttpResponse.json({ url: 'https://s3.test/original', fileName: 'My Song.wav', contentType: 'audio/wav', expiresAt: 1 }),
      ),
    )
    const { user } = renderAt('/me/my-song')
    await screen.findByRole('heading', { name: 'My Song' })

    await user.click(screen.getByRole('button', { name: 'More options for My Song' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Download original' }))

    await vi.waitFor(() => expect(startDownload).toHaveBeenCalledWith('https://s3.test/original'))
  })

  it("doesn't offer the original to someone it was shared with", async () => {
    serveTrack(theirs)
    const { user } = renderAt('/bob/their-song')
    await screen.findByRole('heading', { name: 'My Song' })

    await user.click(screen.getByRole('button', { name: 'More options for My Song' }))
    await screen.findByRole('menuitem', { name: 'Remove from my library' })

    expect(screen.queryByRole('menuitem', { name: 'Download original' })).not.toBeInTheDocument()
  })

  it("says it isn't available on a 404", async () => {
    serveTrack(404)
    renderAt('/tracks/t1')
    expect(await screen.findByText("This track isn't available")).toBeInTheDocument()
  })
})
