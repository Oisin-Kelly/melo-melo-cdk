import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as mobile from '@/hooks/use-is-mobile'
import { LocationProbe, renderRoutes } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { AlbumsRoute, PlaylistsRoute, TracksRoute } from './manage-routes'

vi.mock('@/hooks/use-is-mobile', () => ({ useIsMobile: vi.fn(() => false) }))

const routes = [
  { path: '/tracks', element: <TracksRoute /> },
  { path: '/albums', element: <AlbumsRoute /> },
  { path: '/playlists', element: <PlaylistsRoute /> },
  { path: '*', element: <LocationProbe /> },
]
const none = () => HttpResponse.json({ items: [], nextCursor: null })

beforeEach(() => {
  vi.mocked(mobile.useIsMobile).mockReturnValue(false)
  server.use(http.get(`${API}/tracks`, none), http.get(`${API}/albums`, none), http.get(`${API}/playlists`, none))
})

describe('the manage screens', () => {
  it('are tables on wider screens, with tabs between the three', async () => {
    const user = userEvent.setup()
    const { router } = renderRoutes(routes, { initialEntries: ['/tracks'] })
    expect(await screen.findByRole('heading', { name: 'Your tracks' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Albums' }))
    expect(await screen.findByRole('heading', { name: 'Your albums' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/albums')

    await user.click(screen.getByRole('link', { name: 'Playlists' }))
    expect(await screen.findByRole('heading', { name: 'Your playlists' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/playlists')
  })

  it.each([
    ['/tracks', '/me'],
    ['/albums', '/me'],
    ['/playlists', '/library'],
  ])('on a phone %s goes to %s', async (from, to) => {
    vi.mocked(mobile.useIsMobile).mockReturnValue(true)
    renderRoutes(routes, { initialEntries: [from] })
    expect(await screen.findByTestId('location')).toHaveTextContent(to)
  })
})
