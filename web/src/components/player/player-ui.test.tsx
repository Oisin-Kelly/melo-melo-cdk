import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { LikeButton, PlayButton } from '@/components/media/media-rows'
import { trackSummary, userSummary } from '@/testing/fixtures'
import { renderWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { MiniPlayer } from './mini-player'
import { NowPlayingBar } from './now-playing-bar'
import { PlayerProvider } from './player-provider'
import { usePlayContext } from './use-player'

const song = trackSummary('t1', { name: 'Night Drive', duration: 185, owner: userSummary('bob', { displayName: 'Bob' }) })

function AlbumPlay() {
  const play = usePlayContext({ type: 'ALBUM', id: 'al1', name: 'Late Shift', href: '/bob/albums/late-shift' }, [song])
  return <PlayButton label="Play album" text="Play all" {...play} />
}

function renderPlayer() {
  const streams: string[] = []
  server.use(
    http.get(`${API}/tracks/:id/stream`, ({ params }) => {
      streams.push(params.id as string)
      return HttpResponse.json({ url: `https://s3/${params.id}`, expiresAt: Date.now() + 6 * 3600_000, duration: 185 })
    }),
    http.put(`${API}/me/progress`, () => HttpResponse.json({})),
    http.get(`${API}/me/progress`, () => new HttpResponse(null, { status: 204 })),
  )
  renderWithProviders(
    <PlayerProvider>
      <AlbumPlay />
      <NowPlayingBar />
    </PlayerProvider>,
  )
  return streams
}

afterEach(() => sessionStorage.clear())

describe('player UI', () => {
  it('shows nothing until something is played', () => {
    renderPlayer()
    expect(screen.queryByRole('region', { name: 'Now playing' })).not.toBeInTheDocument()
  })

  it('on signing in, puts the saved resume point in the bar, paused at that second', async () => {
    const streams = renderPlayer()
    server.use(
      http.get(`${API}/me/progress`, () =>
        HttpResponse.json({ contextType: 'TRACK', contextId: 't1', trackId: 't1', positionSeconds: 60, updatedAt: 1, track: song }),
      ),
    )
    const bar = await screen.findByRole('region', { name: 'Now playing' })
    expect(bar).toHaveTextContent('Night Drive')
    await waitFor(() => expect(streams).toEqual(['t1']))
    // Ready to go, not playing
    expect(screen.getAllByRole('button', { name: 'Play' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
  })

  it('Play all fetches the stream and the bar shows the track, with the page button turning to Pause', async () => {
    const streams = renderPlayer()
    await userEvent.click(screen.getByRole('button', { name: 'Play all' }))

    const bar = await screen.findByRole('region', { name: 'Now playing' })
    expect(bar).toHaveTextContent('Night Drive')
    // Who made it, then what it's playing from
    expect(bar).toHaveTextContent('Bob · Late Shift')
    expect(screen.getByRole('link', { name: 'Late Shift' })).toHaveAttribute('href', '/bob/albums/late-shift')
    // The track's own length shows before the file's index has loaded
    expect(bar).toHaveTextContent('3:05')
    await waitFor(() => expect(streams).toEqual(['t1']))
    // The page's button and the bar's both offer Pause
    expect(screen.getAllByRole('button', { name: 'Pause' })).toHaveLength(2)
  })

  it('the speaker mutes, and unmutes back to where the volume was', async () => {
    renderPlayer()
    await userEvent.click(screen.getByRole('button', { name: 'Play all' }))
    await screen.findByRole('region', { name: 'Now playing' })
    const volume = () => screen.getByRole('slider', { name: 'Volume' })
    expect(volume()).toHaveAttribute('aria-valuenow', '100')

    await userEvent.click(screen.getByRole('button', { name: 'Mute' }))
    expect(volume()).toHaveAttribute('aria-valuenow', '0')

    await userEvent.click(screen.getByRole('button', { name: 'Unmute' }))
    expect(volume()).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByRole('button', { name: 'Mute' })).toBeInTheDocument()
  })

  it('the same button pauses it again', async () => {
    renderPlayer()
    await userEvent.click(screen.getByRole('button', { name: 'Play all' }))
    await screen.findByRole('region', { name: 'Now playing' })
    await userEvent.click(screen.getAllByRole('button', { name: 'Pause' })[0])
    expect(screen.getByRole('button', { name: 'Play all' })).toBeInTheDocument()
  })

  it('Now playing has a heart beside the title, and follows likes made elsewhere', async () => {
    const likes: boolean[] = []
    server.use(
      http.get(`${API}/tracks/:id/stream`, () => HttpResponse.json({ url: 'https://s3/t1', expiresAt: Date.now() + 6 * 3600_000, duration: 185 })),
      http.put(`${API}/me/progress`, () => HttpResponse.json({})),
      http.get(`${API}/me/progress`, () => new HttpResponse(null, { status: 204 })),
      http.post(`${API}/tracks/:id/like`, async ({ request }) => {
        const { newValue } = (await request.json()) as { newValue: boolean }
        likes.push(newValue)
        return HttpResponse.json({ newValue })
      }),
    )
    renderWithProviders(
      <PlayerProvider>
        <AlbumPlay />
        <MiniPlayer />
        {/* a row's heart somewhere else on the page */}
        <LikeButton kind="TRACK" id="t1" liked name="the row" />
      </PlayerProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Play all' }))
    await userEvent.click(await screen.findByRole('button', { name: /Night Drive/ }))

    await userEvent.click(screen.getByRole('button', { name: 'Like Night Drive' }))
    expect(await screen.findByRole('button', { name: 'Unlike Night Drive' })).toBeInTheDocument()
    await waitFor(() => expect(likes).toEqual([true]))

    // Unliked from the row: the sheet's heart follows
    await userEvent.click(screen.getByRole('button', { name: 'Unlike the row' }))
    expect(await screen.findByRole('button', { name: 'Like Night Drive' })).toBeInTheDocument()
  })
})
