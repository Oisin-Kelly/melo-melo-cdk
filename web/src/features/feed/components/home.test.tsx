import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { albumSummary, trackSummary, user, userSummary } from '@/testing/fixtures'
import { renderWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import type { FeedEntry } from '../api/feed'
import { useHasSidePanel } from '@/hooks/use-has-side-panel'
import { HomePage } from './home-page'

vi.mock('@/hooks/use-has-side-panel', () => ({ useHasSidePanel: vi.fn(() => false) }))

const share = (id: string, sharedAt: number, extra: Partial<FeedEntry> = {}): FeedEntry => ({
  type: 'TRACK',
  sender: userSummary('bob', { displayName: 'Bob' }),
  sharedAt,
  track: trackSummary(id, { name: `Song ${id}` }),
  ...extra,
})

let seenPosts = 0
let feedQueries: string[] = []

function serveHome({ feed, lastSeenAt }: { feed: FeedEntry[]; lastSeenAt?: number }) {
  server.use(
    http.get(`${API}/users/me`, () => HttpResponse.json(user('me', { lastSeenAt }))),
    http.post(`${API}/me/seen`, () => {
      seenPosts++
      return new HttpResponse(null, { status: 204 })
    }),
    http.get(`${API}/me/progress`, () => new HttpResponse(null, { status: 204 })),
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

  it('puts a dot on each share new since your last visit', async () => {
    serveHome({ feed: [share('3', 300), share('2', 200), share('1', 100)], lastSeenAt: 150 })
    renderWithProviders(<HomePage />)
    await screen.findByText('Song 3')

    const entryOf = (song: string) => screen.getByText(song).closest('.mm-feed-entry') as HTMLElement
    expect(within(entryOf('Song 3')).getByRole('img', { name: 'New' })).toBeInTheDocument()
    expect(within(entryOf('Song 2')).getByRole('img', { name: 'New' })).toBeInTheDocument()
    expect(within(entryOf('Song 1')).queryByRole('img', { name: 'New' })).not.toBeInTheDocument()
  })

  it('has no dots on a first visit', async () => {
    serveHome({ feed: [share('2', 200), share('1', 100)] })
    renderWithProviders(<HomePage />)
    await screen.findByText('Song 2')
    expect(screen.queryByRole('img', { name: 'New' })).not.toBeInTheDocument()
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

  it('narrower: with nothing shared yet, suggests people you may know as a shelf', async () => {
    vi.mocked(useHasSidePanel).mockReturnValue(false)
    serveHome({ feed: [] })
    server.use(http.get(`${API}/users/suggestions`, () => HttpResponse.json({ items: [{ user: userSummary('carol', { displayName: 'Carol' }), reason: 'FOLLOWS_YOU', mutuals: [], mutualCount: 0 }] })))
    renderWithProviders(<HomePage />)
    expect(await screen.findByRole('heading', { name: 'People you may know' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'People you may know' })).not.toBeInTheDocument()
  })

  it('wide: People you may know is a side panel, shared or not', async () => {
    vi.mocked(useHasSidePanel).mockReturnValue(true)
    serveHome({ feed: [] })
    server.use(http.get(`${API}/users/suggestions`, () => HttpResponse.json({ items: [{ user: userSummary('carol', { displayName: 'Carol' }), reason: 'FOLLOWS_YOU', mutuals: [], mutualCount: 0 }] })))
    renderWithProviders(<HomePage />)
    const panel = await screen.findByRole('complementary', { name: 'People you may know' })
    expect(await within(panel).findByText('Carol')).toBeInTheDocument()
    // Once, in the panel: not also as a section under the empty feed
    expect(screen.getAllByRole('heading', { name: 'People you may know' })).toHaveLength(1)
  })

  it('says when nothing has been shared yet, per filter', async () => {
    serveHome({ feed: [] })
    const u = userEvent.setup()
    renderWithProviders(<HomePage />)

    expect(await screen.findByText('Nothing shared with you yet')).toBeInTheDocument()
    await u.click(screen.getByRole('radio', { name: 'Tracks' }))
    expect(await screen.findByText('No tracks shared with you yet')).toBeInTheDocument()
  })
})
