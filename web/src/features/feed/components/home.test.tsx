import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { albumSummary, trackSummary, user, userSummary } from '@/testing/fixtures'
import { renderWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import type { FeedEntry } from '../api/feed'
import { HomePage } from './home-page'

const share = (id: string, sharedAt: number, extra: Partial<FeedEntry> = {}): FeedEntry => ({
  type: 'TRACK',
  sender: userSummary('bob', { displayName: 'Bob' }),
  sharedAt,
  track: trackSummary(id, { name: `Song ${id}` }),
  ...extra,
})

let seenPosts = 0
let feedQueries: string[] = []

function serveHome({ feed, lastSeenAt, progress }: { feed: FeedEntry[]; lastSeenAt?: number; progress?: unknown }) {
  server.use(
    http.get(`${API}/users/me`, () => HttpResponse.json(user('me', { lastSeenAt }))),
    http.post(`${API}/me/seen`, () => {
      seenPosts++
      return new HttpResponse(null, { status: 204 })
    }),
    http.get(`${API}/me/progress`, () => (progress ? HttpResponse.json(progress) : new HttpResponse(null, { status: 204 }))),
    http.get(`${API}/feed`, ({ request }) => {
      const url = new URL(request.url)
      feedQueries.push(url.search)
      const type = url.searchParams.get('type')
      const items = type ? feed.filter((e) => e.type === type) : feed
      return HttpResponse.json({ items: url.searchParams.get('sort') === 'asc' ? [...items].reverse() : items, nextCursor: null })
    }),
  )
}

beforeEach(() => {
  seenPosts = 0
  feedQueries = []
})

const labels = () => screen.queryAllByText(/^(NEW SINCE YOUR LAST VISIT|EARLIER)$/).map((el) => el.textContent)

describe('Home', () => {
  it('splits the feed at your last visit, then marks this visit seen (once)', async () => {
    serveHome({ feed: [share('3', 300), share('2', 200), share('1', 100)], lastSeenAt: 150 })
    renderWithProviders(<HomePage />)

    expect(await screen.findByText('Song 3')).toBeInTheDocument()
    expect(labels()).toEqual(['NEW SINCE YOUR LAST VISIT', 'EARLIER'])
    // The label sits right before the first new and the first older share
    const all = screen.getAllByText(/^(NEW SINCE YOUR LAST VISIT|EARLIER|Song \d)$/).map((el) => el.textContent)
    expect(all).toEqual(['NEW SINCE YOUR LAST VISIT', 'Song 3', 'Song 2', 'EARLIER', 'Song 1'])
    await vi.waitFor(() => expect(seenPosts).toBe(1))
  })

  it('has no divider on a first visit, when nothing is new, or oldest-first', async () => {
    serveHome({ feed: [share('2', 200), share('1', 100)] }) // no lastSeenAt: first visit
    const first = renderWithProviders(<HomePage />)
    await screen.findByText('Song 2')
    expect(labels()).toEqual([])
    first.unmount()

    serveHome({ feed: [share('2', 200), share('1', 100)], lastSeenAt: 500 })
    renderWithProviders(<HomePage />)
    await screen.findByText('Song 2')
    expect(labels()).toEqual([])
  })

  it('shows who shared it, when, and their caption', async () => {
    serveHome({ feed: [share('1', Date.now() - 60_000, { caption: 'Listen to the bridge' })] })
    renderWithProviders(<HomePage />)

    expect(await screen.findByText('Listen to the bridge')).toBeInTheDocument()
    expect(screen.getByText(/shared a track/).parentElement).toHaveTextContent(/Bob\s*shared a track/)
    expect(screen.getAllByRole('link').some((a) => a.getAttribute('href') === '/bob')).toBe(true)
  })

  it('filters to albums and flips to oldest first, each its own request', async () => {
    serveHome({
      feed: [share('1', 100), share('a', 90, { type: 'ALBUM', track: undefined, album: albumSummary('a', { name: 'Album a' }) })],
    })
    const u = userEvent.setup()
    renderWithProviders(<HomePage />)
    await screen.findByText('Song 1')

    await u.click(screen.getByRole('radio', { name: 'Albums' }))
    expect(await screen.findByText('Album a')).toBeInTheDocument()
    expect(screen.queryByText('Song 1')).not.toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: /Newest/ }))
    await u.click(await screen.findByRole('menuitem', { name: 'Oldest' }))
    await vi.waitFor(() => expect(feedQueries).toContain('?type=ALBUM&sort=asc'))
  })

  it('says when nothing has been shared yet, per filter', async () => {
    serveHome({ feed: [] })
    const u = userEvent.setup()
    renderWithProviders(<HomePage />)

    expect(await screen.findByText('Nothing shared with you yet')).toBeInTheDocument()
    await u.click(screen.getByRole('radio', { name: 'Tracks' }))
    expect(await screen.findByText('No tracks shared with you yet')).toBeInTheDocument()
  })

  it('offers to continue listening when there is something to resume', async () => {
    serveHome({
      feed: [],
      progress: { contextType: 'TRACK', contextId: 't9', trackId: 't9', positionSeconds: 60, updatedAt: 1, track: trackSummary('t9', { name: 'Half heard', duration: 360 }) },
    })
    renderWithProviders(<HomePage />)

    expect(await screen.findByText('Continue listening')).toBeInTheDocument()
    expect(screen.getByText('Half heard')).toBeInTheDocument()
    expect(screen.getByText(/5 min left/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Resume/ })).toHaveAttribute('aria-disabled', 'true') // until playback exists
  })

  it('shows no card when there is nothing to resume', async () => {
    serveHome({ feed: [share('1', 100)] })
    renderWithProviders(<HomePage />)
    await screen.findByText('Song 1')
    expect(screen.queryByText('Continue listening')).not.toBeInTheDocument()
  })
})
