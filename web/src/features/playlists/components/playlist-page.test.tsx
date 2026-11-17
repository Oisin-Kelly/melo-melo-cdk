import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as compact from '@/hooks/use-is-compact'
import * as mobile from '@/hooks/use-is-mobile'
import type { Playlist, PlaylistTrackEntry } from '@/lib/playlists'
import { trackSummary } from '@/testing/fixtures'
import { LocationProbe, renderRoutes } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { PlaylistPage } from './playlist-page'

vi.mock('@/hooks/use-is-mobile', () => ({ useIsMobile: vi.fn(() => false) }))
vi.mock('@/hooks/use-is-compact', () => ({ useIsCompact: vi.fn(() => false) }))
// A phone is both: under 768px (mobile) and so under 1024px (compact)
const setMobile = (value: boolean) => {
  vi.mocked(mobile.useIsMobile).mockReturnValue(value)
  vi.mocked(compact.useIsCompact).mockReturnValue(value)
}

const playlist: Playlist = { id: 'p1', name: 'Road Trip', description: 'For the M50', type: 'CUSTOM', slug: 'road-trip', imageUrl: null, imageBgColor: null, trackCount: 3, totalDurationSeconds: 540, createdAt: 0 }
const available = (id: string, name: string): PlaylistTrackEntry => ({ trackId: id, name, duration: 180, addedAt: 0, unavailable: false, track: trackSummary(id, { name }) })

let entries: PlaylistTrackEntry[]
let removed: string[]

beforeEach(() => {
  setMobile(false)
  entries = [
    available('t1', 'First'),
    { trackId: 't2', name: 'Gone song', duration: 200, addedAt: 0, unavailable: true, reason: 'DELETED' },
    { trackId: 't3', name: 'Unshared song', duration: 100, addedAt: 0, unavailable: true, reason: 'REVOKED' },
  ]
  removed = []
  server.use(
    http.get(`${API}/playlists/p1`, () => HttpResponse.json({ playlist, tracks: { items: entries, nextCursor: null } })),
    http.get(`${API}/playlists`, () => HttpResponse.json({ items: [playlist], nextCursor: null })),
    http.delete(`${API}/playlists/p1/tracks/:trackId`, ({ params }) => {
      removed.push(params.trackId as string)
      entries = entries.filter((e) => e.trackId !== params.trackId)
      return HttpResponse.json({ trackId: params.trackId, removed: true })
    }),
  )
})

function renderAt(path: string | string[]) {
  const result = renderRoutes(
    [
      { path: '/', element: <LocationProbe /> },
      { path: '/somewhere', element: <LocationProbe /> },
      { path: '/library', element: <LocationProbe /> },
      { path: '/playlists/:id', element: <PlaylistPage playlistId="p1" /> },
      { path: '/:username/playlists/:slug', element: <PlaylistPage playlistId="p1" /> },
    ],
    { initialEntries: Array.isArray(path) ? path : [path], username: 'me' },
  )
  return { ...result, user: userEvent.setup() }
}

describe('PlaylistPage', () => {
  it('lists available tracks and says why the others are unavailable', async () => {
    renderAt('/me/playlists/road-trip')
    expect(await screen.findByRole('link', { name: 'First' })).toBeInTheDocument()
    expect(screen.getByText(/Deleted by its owner/)).toBeInTheDocument()
    expect(screen.getByText(/No longer shared with you/)).toBeInTheDocument()
  })

  it('numbers the rows and says when each track was added, under column names', async () => {
    renderAt('/me/playlists/road-trip')
    await screen.findByRole('link', { name: 'First' })
    expect(screen.getByText('#')).toBeInTheDocument()
    expect(screen.getByText('DATE ADDED')).toBeInTheDocument()
    // Placeholders are numbered too; only available tracks carry a date
    expect(document.querySelectorAll('.mm-row .mm-row-number')).toHaveLength(3)
    expect([...document.querySelectorAll('.mm-row .mm-row-number')].map((n) => n.textContent)).toEqual(['1', '2', '3'])
    expect(screen.getByText(new Date(0).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))).toBeInTheDocument()
  })

  it('moves an old id link to the readable URL under your name', async () => {
    const { router } = renderAt('/playlists/p1')
    await screen.findByRole('heading', { name: 'Road Trip' })
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/me/playlists/road-trip'))
  })

  it('removes an unavailable placeholder', async () => {
    const { user } = renderAt('/me/playlists/road-trip')
    await screen.findByText('Gone song')

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    // Asks first, placeholders included
    const confirm = await screen.findByRole('alertdialog', { name: 'Remove Gone song?' })
    expect(removed).toEqual([])
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }))

    await vi.waitFor(() => expect(screen.queryByText('Gone song')).not.toBeInTheDocument())
    expect(removed).toEqual(['t2'])
  })

  it('removes an available track from its menu', async () => {
    const { user } = renderAt('/me/playlists/road-trip')
    await screen.findByRole('link', { name: 'First' })

    await user.click(screen.getByRole('button', { name: 'More options for First' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Remove from this playlist' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Remove First?' })
    expect(removed).toEqual([])
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }))

    await vi.waitFor(() => expect(removed).toEqual(['t1']))
  })

  async function deletePlaylist(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole('heading', { name: 'Road Trip' })
    await user.click(screen.getByRole('button', { name: 'More playlist options' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete playlist' }))
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Delete Road Trip?' })).getByRole('button', { name: 'Delete' }))
  }

  it('deletes the playlist after confirming and goes back to where you came from', async () => {
    let deleted = false
    server.use(
      http.delete(`${API}/playlists/p1`, () => {
        deleted = true
        return HttpResponse.json({ message: 'ok' })
      }),
    )
    // Came here from another page in the app (the data router's history index)
    window.history.replaceState({ idx: 1 }, '')
    const { user, router } = renderAt(['/somewhere', '/me/playlists/road-trip'])

    await deletePlaylist(user)

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/somewhere'))
    expect(deleted).toBe(true)
    window.history.replaceState(null, '')
  })

  it('opened from a link, deleting it lands on Library', async () => {
    server.use(http.delete(`${API}/playlists/p1`, () => HttpResponse.json({ message: 'ok' })))
    const { user, router } = renderAt('/me/playlists/road-trip')

    await deletePlaylist(user)

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/library'))
  })

  it('invites you to add tracks when it is empty', async () => {
    entries = []
    renderAt('/me/playlists/road-trip')
    expect(await screen.findByText('Nothing in this playlist yet')).toBeInTheDocument()
  })

  it("says it doesn't exist on a 404", async () => {
    server.use(http.get(`${API}/playlists/p1`, () => HttpResponse.json({}, { status: 404 })))
    renderAt('/playlists/p1')
    expect(await screen.findByText("This playlist doesn't exist")).toBeInTheDocument()
  })
})

describe('PlaylistPage search + sort', () => {
  // Two pages of 2: page 1 without a cursor, page 2 at cursor "c2"
  const page1 = [available('a', 'Charlie'), available('b', 'alpha')]
  const page2 = [available('c', 'Bravo'), { trackId: 'd', name: 'Delta gone', duration: 200, addedAt: 0, unavailable: true, reason: 'DELETED' as const }]
  let requests: string[]

  beforeEach(() => {
    requests = []
    server.use(
      http.get(`${API}/playlists/p1`, ({ request }) => {
        const url = new URL(request.url)
        requests.push(url.search)
        const isSecond = url.searchParams.get('cursor') === 'c2'
        return HttpResponse.json({
          playlist: { ...playlist, trackCount: 4 },
          tracks: { items: isSecond ? page2 : page1, nextCursor: isSecond ? null : 'c2' },
        })
      }),
    )
  })

  const shownTitles = () =>
    screen.getAllByRole('link', { name: /^(Charlie|alpha|Bravo)$/ }).map((link) => link.textContent)

  it('loads the whole playlist, then sorts it, when opened with ?sort=', async () => {
    renderAt('/me/playlists/road-trip?sort=title')

    await screen.findByRole('link', { name: 'Bravo' })
    expect(shownTitles()).toEqual(['alpha', 'Bravo', 'Charlie'])
    expect(requests).toEqual(['?limit=100', '?limit=100&cursor=c2'])
    expect(screen.getByRole('button', { name: /Title/ })).toBeInTheDocument()
  })

  it('keeps the playlist order and pages as you scroll by default', async () => {
    renderAt('/me/playlists/road-trip')
    await screen.findByRole('link', { name: 'Charlie' })
    expect(shownTitles()).toEqual(['Charlie', 'alpha'])
    expect(requests).toEqual(['?limit=100'])
  })

  it('re-orders from the sort menu and puts it in the URL', async () => {
    const { user, router } = renderAt('/me/playlists/road-trip')
    await screen.findByRole('link', { name: 'Charlie' })

    await user.click(screen.getByRole('button', { name: /Playlist order/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Title' }))

    await screen.findByRole('link', { name: 'Bravo' })
    expect(shownTitles()).toEqual(['alpha', 'Bravo', 'Charlie'])
    expect(router.state.location.search).toBe('?sort=title')
  })

  it('searches the whole playlist from the magnifier, placeholders included, and says when nothing matches', async () => {
    const { user, router } = renderAt('/me/playlists/road-trip')
    await screen.findByRole('link', { name: 'Charlie' })

    await user.click(screen.getByRole('button', { name: 'Search this playlist' }))
    const search = screen.getByRole('textbox', { name: 'playlist search' })
    expect(search).toHaveFocus()

    await user.type(search, 'delta')
    expect(await screen.findByText('Delta gone')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Charlie' })).not.toBeInTheDocument()
    expect(router.state.location.search).toBe('?q=delta')

    await user.clear(search)
    await user.type(search, 'zzz')
    expect(await screen.findByText('No tracks match “zzz”')).toBeInTheDocument()
  })

  it('folds the magnifier back when you leave it empty', async () => {
    const { user } = renderAt('/me/playlists/road-trip')
    await screen.findByRole('link', { name: 'Charlie' })

    await user.click(screen.getByRole('button', { name: 'Search this playlist' }))
    await user.click(screen.getByRole('heading', { name: 'Road Trip' }))

    expect(screen.queryByRole('textbox', { name: 'playlist search' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search this playlist' })).toBeInTheDocument()
  })

  it('on phones, the magnifier swaps the header for the search until Cancel', async () => {
    setMobile(true)
    const { user, router } = renderAt('/me/playlists/road-trip')
    await screen.findByRole('heading', { name: 'Road Trip' })
    expect(screen.queryByRole('textbox', { name: 'playlist search' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Search this playlist' }))
    const search = screen.getByRole('textbox', { name: 'playlist search' })
    expect(search).toHaveFocus()
    expect(screen.queryByRole('heading', { name: 'Road Trip' })).not.toBeInTheDocument()
    expect(screen.queryByText('For the M50')).not.toBeInTheDocument()

    await user.type(search, 'delta')
    expect(await screen.findByText('Delta gone')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('heading', { name: 'Road Trip' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'playlist search' })).not.toBeInTheDocument()
    expect(router.state.location.search).toBe('')
    expect(await screen.findByRole('link', { name: 'Charlie' })).toBeInTheDocument()
  })

  it('on phones, opens straight into search when the link has ?q=', async () => {
    setMobile(true)
    renderAt('/me/playlists/road-trip?q=delta')
    expect(await screen.findByText('Delta gone')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'playlist search' })).toHaveValue('delta')
    expect(screen.queryByRole('heading', { name: 'Road Trip' })).not.toBeInTheDocument()
  })

  it('has no search or sort on an empty playlist', async () => {
    server.use(
      http.get(`${API}/playlists/p1`, () =>
        HttpResponse.json({ playlist: { ...playlist, trackCount: 0 }, tracks: { items: [], nextCursor: null } }),
      ),
    )
    renderAt('/me/playlists/road-trip')
    await screen.findByText('Nothing in this playlist yet')
    expect(screen.queryByRole('button', { name: 'Search this playlist' })).not.toBeInTheDocument()
  })
})

describe('PlaylistPage for the likes playlist (Liked tracks)', () => {
  const likes: Playlist = { ...playlist, id: 'likes', name: 'Likes', description: null, type: 'LIKES', slug: null, trackCount: 1, totalDurationSeconds: 180 }
  let liked: PlaylistTrackEntry[]

  beforeEach(() => {
    liked = [{ ...available('t1', 'Loved'), addedAt: Date.now(), track: trackSummary('t1', { name: 'Loved', likedByMe: true }) }]
    server.use(http.get(`${API}/playlists/likes`, () => HttpResponse.json({ playlist: likes, tracks: { items: liked, nextCursor: null } })))
  })

  const renderLiked = (path = '/liked') => {
    const result = renderRoutes([{ path: '/liked', element: <PlaylistPage playlistId="likes" /> }], { initialEntries: [path], username: 'me' })
    return { ...result, user: userEvent.setup() }
  }

  it('is "Liked tracks", with no Edit or Delete, and says when each track was liked', async () => {
    renderLiked()
    expect(await screen.findByRole('heading', { name: 'Liked tracks' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Loved' })).toBeInTheDocument()
    expect(screen.getByText(/now|second/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More playlist options' })).not.toBeInTheDocument()
  })

  it('has no "Remove from this playlist": the heart is how a track leaves', async () => {
    const { user } = renderLiked()
    await user.click(await screen.findByRole('button', { name: 'More options for Loved' }))
    expect(await screen.findByRole('menuitem', { name: /Add to playlist/ })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Remove from this playlist' })).not.toBeInTheDocument()
  })

  it('unliking keeps the row, so a mis-tap can be undone in place', async () => {
    server.use(http.post(`${API}/tracks/t1/like`, () => HttpResponse.json({ newValue: false })))
    const { user } = renderLiked()

    await user.click(await screen.findByRole('button', { name: 'Unlike Loved' }))

    expect(await screen.findByRole('button', { name: 'Like Loved' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Loved' })).toBeInTheDocument()
  })

  it('sorts newest like first as "Recently liked", with no separate Recently added', async () => {
    const { user } = renderLiked('/liked?sort=added')
    await user.click(await screen.findByRole('button', { name: /Recently liked/ }))
    expect(await screen.findByRole('menuitem', { name: 'Title' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Recently added' })).not.toBeInTheDocument()
  })

  it('says what to do when nothing is liked yet', async () => {
    liked = []
    server.use(
      http.get(`${API}/playlists/likes`, () =>
        HttpResponse.json({ playlist: { ...likes, trackCount: 0 }, tracks: { items: [], nextCursor: null } }),
      ),
    )
    renderLiked()
    expect(await screen.findByText('No liked tracks yet')).toBeInTheDocument()
  })
})
