import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeModeProvider } from '@/components/theme/theme-mode'
import * as mobile from '@/hooks/use-is-mobile'
import { user } from '@/testing/fixtures'
import { renderRoutes } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { AppLayout } from './app-layout'

vi.mock('@/hooks/use-is-mobile', () => ({ useIsMobile: vi.fn(() => false) }))

beforeEach(() => {
  vi.mocked(mobile.useIsMobile).mockReturnValue(false)
  server.use(
    http.get(`${API}/users/me`, () => HttpResponse.json(user('me', { displayName: 'Me' }))),
    http.get(`${API}/activity`, () => HttpResponse.json({ items: [], nextCursor: null })),
    http.get(`${API}/playlists`, () =>
      HttpResponse.json({
        items: [{ id: 'p1', name: 'Road trip', type: 'CUSTOM', slug: 'road-trip', description: null, imageUrl: null, imageBgColor: null, trackCount: 0, totalDurationSeconds: 0, createdAt: 0 }],
        nextCursor: null,
      }),
    ),
  )
})

function renderAt(path: string) {
  return renderRoutes(
    [{ element: <ThemeModeProvider><AppLayout /></ThemeModeProvider>, children: [{ path: '*', element: <p>Page content</p> }] }],
    { initialEntries: [path], username: 'me' },
  )
}

const current = (nav: HTMLElement) =>
  within(nav).queryAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent)

describe('AppLayout (wider screens)', () => {
  it('has the header pieces and the side nav around the page', async () => {
    renderAt('/')
    expect(screen.getByText('Page content')).toBeInTheDocument()
    expect(screen.getByLabelText('Search')).toBeInTheDocument()
    // Upload is a dialog over the page, opened from the header
    expect(screen.getByRole('button', { name: /Upload track/ })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/me')
    expect(await screen.findByRole('link', { name: /Road trip/ })).toHaveAttribute('href', '/me/playlists/road-trip')
  })

  it.each([
    ['/', ['Home']],
    ['/library', ['Library']],
    ['/liked', ['Liked tracks']],
    ['/tracks', ['Manage']],
    ['/albums', ['Manage']],
    ['/playlists', ['Manage']],
    ['/tracks/t1', []],
    ['/me', ['Profile']],
    ['/me/followers', ['Profile']],
    // Your tracks and playlists live under /me/… but aren't "Profile"
    ['/me/my-song', []],
    ['/me/playlists/road-trip', ['Road trip']],
    ['/meme', []],
  ])('at %s the side nav highlights %j', async (path, expected) => {
    renderAt(path)
    await screen.findByRole('link', { name: /Road trip/ })
    const nav = screen.getByRole('link', { name: 'Home' }).closest('nav')!
    expect(current(nav)).toEqual(expected)
  })
})

describe('AppLayout (phones)', () => {
  beforeEach(() => vi.mocked(mobile.useIsMobile).mockReturnValue(true))

  it('swaps the side nav for bottom tabs, with your avatar linking to your profile', async () => {
    renderAt('/')
    const tabs = screen.getByRole('navigation', { name: /tabs|Main/i })
    expect(within(tabs).getAllByRole('link').map((a) => a.textContent)).toEqual(['Home', 'Search', 'Library', 'Settings'])
    expect(await screen.findByRole('link', { name: /your profile/ })).toHaveAttribute('href', '/me')
  })

  it.each([
    ['/', 'Home'],
    ['/search?q=x', 'Search'],
    ['/liked', 'Library'],
    ['/me/playlists/road-trip', 'Library'],
    ['/settings/profile', 'Settings'],
  ])('at %s the %s tab is current', (path, tab) => {
    renderAt(path)
    const tabs = screen.getByRole('navigation', { name: /tabs|Main/i })
    expect(current(tabs)).toEqual([tab])
  })
})
