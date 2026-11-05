import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { albumSummary, trackSummary, userSummary } from '@/testing/fixtures'
import { LocationProbe, renderWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { GlobalSearch } from './global-search'
import { SearchPage } from './search-page'
import { SearchResults } from './search-results'

const page = <T,>(items: T[]) => ({ items, nextCursor: null })

function serveLibrary({ failAlbums = false, people = [userSummary('oisin', { displayName: 'Oisín' })] } = {}) {
  server.use(
    http.get(`${API}/tracks/library`, () =>
      HttpResponse.json(page([trackSummary('t1', { name: 'Summer Song', slug: 'summer-song', owner: userSummary('bob') })])),
    ),
    http.get(`${API}/albums`, () => (failAlbums ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(page([albumSummary('a1', { name: 'Summer EP' })])))),
    http.get(`${API}/albums/shared`, () => HttpResponse.json(page([]))),
    http.get(`${API}/albums/liked`, () => HttpResponse.json(page([]))),
    http.get(`${API}/playlists`, () => HttpResponse.json(page([{ id: 'p1', name: 'Summer drive', slug: 'summer-drive', imageUrl: null, imageBgColor: null }]))),
    http.get(`${API}/users/search`, () => HttpResponse.json(page(people))),
  )
}

beforeEach(() => serveLibrary())

describe('SearchResults', () => {
  it('groups people, then tracks, albums and playlists, each linking to its page', async () => {
    renderWithProviders(<SearchResults query="summer" onPicked={() => {}} />, { username: 'me' })

    expect(await screen.findByText('Summer Song')).toBeInTheDocument()
    const groups = screen.getAllByText(/^(PEOPLE|TRACKS|ALBUMS|PLAYLISTS)$/).map((el) => el.textContent)
    expect(groups).toEqual(['PEOPLE', 'TRACKS', 'ALBUMS', 'PLAYLISTS'])
    expect(screen.getByRole('link', { name: /Summer Song/ })).toHaveAttribute('href', '/bob/summer-song')
    expect(screen.getByRole('link', { name: /Summer drive/ })).toHaveAttribute('href', '/me/playlists/summer-drive')
    expect(screen.getByRole('link', { name: /Oisín/ })).toHaveAttribute('href', '/oisin')
  })

  it('says when nothing matches', async () => {
    serveLibrary({ people: [] })
    renderWithProviders(<SearchResults query="zzz" onPicked={() => {}} />)
    expect(await screen.findByText('No results for “zzz”')).toBeInTheDocument()
  })

  it("never shows a partial library as \"no results\": it says what didn't load, with a retry", async () => {
    serveLibrary({ failAlbums: true, people: [] })
    renderWithProviders(<SearchResults query="zzz" onPicked={() => {}} />)

    expect(await screen.findByText("Couldn't search everything")).toBeInTheDocument()
    serveLibrary({ people: [] })
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No results for “zzz”')).toBeInTheDocument()
  })

  // Note: Astryx's Item skips its onClick for clicks on its own link, so `onPicked` doesn't
  // run when a result is clicked; the header search relies on clearing itself on navigation
  // instead (tested below). Picking the page you're already on therefore leaves it open.
})

describe('SearchPage (the phone Search tab)', () => {
  it('keeps the query in ?q= so going back returns to the same results', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/search" element={<><SearchPage /><LocationProbe /></>} />
      </Routes>,
      { route: '/search' },
    )

    await userEvent.type(screen.getByLabelText('Search'), 'summer')

    expect(screen.getByTestId('location')).toHaveTextContent('/search?q=summer')
    expect(await screen.findByText('Summer Song')).toBeInTheDocument()
  })

  it('shows results straight away for a ?q= in the URL', async () => {
    renderWithProviders(<Routes><Route path="/search" element={<SearchPage />} /></Routes>, { route: '/search?q=summer' })
    expect(await screen.findByText('Summer Song')).toBeInTheDocument()
  })
})

describe('GlobalSearch (the header field)', () => {
  it('opens results as you type and clears itself once you pick one', async () => {
    const u = userEvent.setup()
    renderWithProviders(
      <Routes>
        <Route path="*" element={<><GlobalSearch /><LocationProbe /></>} />
      </Routes>,
      { route: '/library' },
    )

    await u.type(screen.getByLabelText('Search'), 'summer')
    await u.click(await screen.findByRole('link', { name: /Summer Song/ }))

    expect(screen.getByTestId('location')).toHaveTextContent('/bob/summer-song')
    expect(screen.getByLabelText('Search')).toHaveValue('')
  })
})
