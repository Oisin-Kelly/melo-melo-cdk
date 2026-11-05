import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as mobile from '@/hooks/use-is-mobile'
import { albumSummary, trackSummary, userSummary } from '@/testing/fixtures'
import { renderWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { AlbumRow, PlayButton, TrackMenu, TrackRow } from './media-rows'

vi.mock('@/hooks/use-is-mobile', () => ({ useIsMobile: vi.fn(() => false) }))
const setMobile = (value: boolean) => vi.mocked(mobile.useIsMobile).mockReturnValue(value)

const playlist = (id: string, name: string, type = 'CUSTOM') => ({
  id, name, type, slug: id, description: null, imageUrl: null, imageBgColor: null, trackCount: 0, totalDurationSeconds: 0, createdAt: 0,
})

function servePlaylists(...items: ReturnType<typeof playlist>[]) {
  server.use(http.get(`${API}/playlists`, () => HttpResponse.json({ items, nextCursor: null })))
}

beforeEach(() => {
  setMobile(false)
  servePlaylists()
})

const song = trackSummary('t1', { name: 'My Song', duration: 154, slug: 'my-song', owner: userSummary('oisin', { displayName: 'Oisín' }) })

describe('TrackRow', () => {
  it('links the title to the readable URL, with owner and length on the second line', () => {
    renderWithProviders(<TrackRow track={song} showOwner />)

    expect(screen.getByRole('link', { name: 'My Song' })).toHaveAttribute('href', '/oisin/my-song')
    expect(screen.getByRole('link', { name: 'Oisín' })).toHaveAttribute('href', '/oisin')
    expect(screen.getByText(/2:34/)).toBeInTheDocument()
  })

  it('on wider screens has its own heart, which likes through the shared mutation', async () => {
    let body: unknown
    server.use(
      http.post(`${API}/tracks/t1/like`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ newValue: true })
      }),
    )
    renderWithProviders(<TrackRow track={song} />)

    await userEvent.click(screen.getByRole('button', { name: 'Like My Song' }))

    await vi.waitFor(() => expect(body).toEqual({ newValue: true }))
  })

  it('on phones moves the heart into ⋯ and shows "liked" on the second line', async () => {
    setMobile(true)
    renderWithProviders(<TrackRow track={{ ...song, likedByMe: true }} aside="liked 2d ago" />)

    expect(screen.queryByRole('button', { name: /^(Like|Unlike) My Song/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Liked')).toBeInTheDocument()
    expect(screen.getByText(/liked 2d ago/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'More options for My Song' }))
    expect(await screen.findByRole('menuitem', { name: 'Unlike' })).toBeInTheDocument()
  })

  it('flat rows (the default) have no play button of their own', () => {
    renderWithProviders(<TrackRow track={song} />)
    expect(screen.queryByRole('button', { name: 'Play My Song' })).not.toBeInTheDocument()
  })

  it("card rows can't play yet: the play button is disabled, with a tooltip saying so", () => {
    renderWithProviders(<TrackRow track={song} variant="card" />)
    // aria-disabled (not disabled) keeps it focusable, so the tooltip can still explain why
    const play = screen.getByRole('button', { name: 'Play My Song' })
    expect(play).toHaveAttribute('aria-disabled', 'true')
    expect(document.getElementById(play.getAttribute('aria-describedby')!)).toHaveTextContent('Playback coming soon')
  })

  it('falls back to the id route for a track without a slug', () => {
    renderWithProviders(<TrackRow track={{ ...song, slug: null }} />)
    expect(screen.getByRole('link', { name: 'My Song' })).toHaveAttribute('href', '/tracks/t1')
  })
})

describe('TrackMenu', () => {
  it('offers your custom playlists (not likes, not the one being viewed) and adds to the one picked', async () => {
    servePlaylists(playlist('likes', 'Likes', 'LIKES'), playlist('p1', 'Road trip'), playlist('p2', 'Gym'))
    let added = ''
    server.use(
      http.post(`${API}/playlists/:id/tracks/:trackId`, ({ params }) => {
        added = `${params.id}/${params.trackId}`
        return HttpResponse.json({ trackId: params.trackId, added: true })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<TrackMenu track={song} excludePlaylistId="p2" />)

    await user.click(screen.getByRole('button', { name: 'More options for My Song' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Add to playlist' }))

    expect(await screen.findByRole('menuitem', { name: 'Road trip' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Likes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Gym' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: 'Road trip' }))
    await vi.waitFor(() => expect(added).toBe('p1/t1'))
  })

  it("says so when there's nowhere to add it", async () => {
    servePlaylists(playlist('likes', 'Likes', 'LIKES'))
    const user = userEvent.setup()
    renderWithProviders(<TrackMenu track={song} />)

    await user.click(screen.getByRole('button', { name: 'More options for My Song' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Add to playlist' }))

    expect(await screen.findByRole('menuitem', { name: 'No other playlists yet' })).toBeInTheDocument()
  })

  it("adds the screen's own items after Add to playlist", async () => {
    const onRemove = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<TrackMenu track={song} extraItems={[{ label: 'Remove from playlist', onClick: onRemove }]} />)

    await user.click(screen.getByRole('button', { name: 'More options for My Song' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Remove from playlist' }))

    expect(onRemove).toHaveBeenCalled()
  })
})

describe('AlbumRow', () => {
  it('links to the album and counts its tracks and length', () => {
    renderWithProviders(<AlbumRow album={albumSummary('a1', { name: 'Summer', slug: 'summer', trackCount: 1, totalDurationSeconds: 1560 })} />)

    expect(screen.getByRole('link', { name: 'Summer' })).toHaveAttribute('href', '/owner/albums/summer')
    expect(screen.getByText(/Album · 1 track · 26 min/)).toBeInTheDocument()
  })

  it('names the owner instead of "Album" when asked', () => {
    renderWithProviders(<AlbumRow album={albumSummary('a1', { trackCount: 2, totalDurationSeconds: 0 })} showOwner />)
    expect(screen.getByRole('link', { name: 'owner' })).toHaveAttribute('href', '/owner')
    expect(screen.getByText(/2 tracks/)).toBeInTheDocument()
  })
})

describe('PlayButton', () => {
  it('plays when it has a handler, as a pill when given text', async () => {
    const onPlay = vi.fn()
    renderWithProviders(<PlayButton label="Play album" text="Play all" onPlay={onPlay} />)

    await userEvent.click(screen.getByRole('button', { name: /Play all/ }))

    expect(onPlay).toHaveBeenCalled()
  })
})
