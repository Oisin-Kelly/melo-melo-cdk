import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrackRow } from '@/components/media/media-rows'
import * as mobile from '@/hooks/use-is-mobile'
import { trackPath } from '@/lib/links'
import { trackSummary, userSummary } from '@/testing/fixtures'
import { renderWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { NowPlayingBar } from './now-playing-bar'
import { PlayerProvider } from './player-provider'
import { TrackListPlayback } from './track-list-playback'

vi.mock('@/hooks/use-is-mobile', () => ({ useIsMobile: vi.fn(() => false) }))

const bob = userSummary('bob', { displayName: 'Bob' })
const tracks = ['One', 'Two', 'Three'].map((name, i) => trackSummary(`t${i + 1}`, { name, owner: bob }))
const album = { type: 'ALBUM' as const, id: 'al1', name: 'Late Shift', href: '/bob/albums/late-shift' }

let streams: string[]
beforeEach(() => {
  vi.mocked(mobile.useIsMobile).mockReturnValue(false)
  streams = []
  server.use(
    http.get(`${API}/playlists`, () => HttpResponse.json({ items: [], nextCursor: null })),
    http.get(`${API}/tracks/:id/stream`, ({ params }) => {
      streams.push(params.id as string)
      return HttpResponse.json({ url: `https://s3/${params.id}`, expiresAt: Date.now() + 6 * 3600_000, duration: 100 })
    }),
    http.put(`${API}/me/progress`, () => HttpResponse.json({})),
    http.get(`${API}/me/progress`, () => new HttpResponse(null, { status: 204 })),
  )
})
afterEach(() => sessionStorage.clear())

/** The album's rows (`shown`: just some of them, so a test has only one ⋯ menu). */
function renderList(shown = tracks) {
  return renderWithProviders(
    <PlayerProvider>
      <TrackListPlayback context={album} tracks={tracks}>
        {shown.map((track) => (
          <TrackRow key={track.id} track={track} />
        ))}
      </TrackListPlayback>
      <NowPlayingBar />
    </PlayerProvider>,
  )
}

const bar = () => screen.getByRole('region', { name: 'Now playing' })

describe('playing from track rows', () => {
  it('tapping a row plays the list from that row, and marks the row as playing', async () => {
    renderList()
    await userEvent.click(screen.getByRole('button', { name: 'Play Two' }))

    await waitFor(() => expect(bar()).toHaveTextContent('Two'))
    expect(bar()).toHaveTextContent('Bob · Late Shift')
    await waitFor(() => expect(streams[0]).toBe('t2'))
    // The row's own button now pauses it
    expect(screen.getByRole('button', { name: 'Pause Two' })).toBeInTheDocument()
  })

  it('the title still opens the track on wider screens', () => {
    renderList()
    expect(screen.getByRole('link', { name: 'One' })).toHaveAttribute('href', trackPath(tracks[0]))
  })

  it('on phones the title is text (the row plays) and ⋯ has Go to track', async () => {
    vi.mocked(mobile.useIsMobile).mockReturnValue(true)
    renderList([tracks[0]])
    expect(screen.queryByRole('link', { name: 'One' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'More options for One' }))
    expect(screen.getByRole('menuitem', { name: 'Go to track' })).toHaveAttribute('href', trackPath(tracks[0]))
  })

  it('Play next with nothing playing just plays the track', async () => {
    renderList([tracks[2]])
    await userEvent.click(screen.getByRole('button', { name: 'More options for Three' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Play next' }))
    await waitFor(() => expect(bar()).toHaveTextContent('Three'))
  })

  it('Add to queue while something plays shows it in the queue', async () => {
    renderList([tracks[2]])
    // Three plays from the album, then is queued again on top
    await userEvent.click(screen.getByRole('button', { name: 'Play Three' }))
    await waitFor(() => expect(bar()).toHaveTextContent('Three'))
    await userEvent.click(screen.getByRole('button', { name: 'More options for Three' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add to queue' }))

    await userEvent.click(within(bar()).getByRole('button', { name: 'Queue' }))
    const queue = await screen.findByRole('dialog', { name: 'Queue' })
    expect(within(queue).getByText('NEXT IN QUEUE')).toBeInTheDocument()
    // Nothing left in the album after Three: just your queue
    expect(within(queue).queryByText('NEXT FROM LATE SHIFT')).not.toBeInTheDocument()
    await userEvent.click(within(queue).getByRole('button', { name: 'Remove Three from the queue' }))
    expect(within(queue).queryByText('NEXT IN QUEUE')).not.toBeInTheDocument()
  })

  it('tapping a track in the queue plays it now; arrow keys on its handle move it', async () => {
    renderList()
    await userEvent.click(screen.getByRole('button', { name: 'Play One' }))
    await waitFor(() => expect(bar()).toHaveTextContent('One'))

    await userEvent.click(within(bar()).getByRole('button', { name: 'Queue' }))
    const queue = await screen.findByRole('dialog', { name: 'Queue' })
    const order = () => within(queue).getAllByRole('button', { name: /^Play / }).map((b) => b.getAttribute('aria-label'))
    expect(order()).toEqual(['Play Two', 'Play Three'])

    // Three up, before Two
    fireEvent.keyDown(within(queue).getByRole('button', { name: /^Move Three/ }), { key: 'ArrowUp' })
    await waitFor(() => expect(order()).toEqual(['Play Three', 'Play Two']))

    await userEvent.click(within(queue).getByRole('button', { name: 'Play Two' }))
    await waitFor(() => expect(bar()).toHaveTextContent('Two'))
    await waitFor(() => expect(streams).toContain('t2'))
  })
})
