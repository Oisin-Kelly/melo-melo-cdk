import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Playlist } from '@/lib/playlists'
import { albumSummary } from '@/testing/fixtures'
import { renderWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { LibraryPage } from './library-page'
import { SidebarPlaylists } from './sidebar-playlists'

const playlist = (id: string, name: string, extra: Partial<Playlist> = {}): Playlist => ({
  id, name, description: null, type: 'CUSTOM', slug: id, imageUrl: null, imageBgColor: null, trackCount: 2, totalDurationSeconds: 0, createdAt: 0, ...extra,
})

let items: Playlist[]
let likedAlbums: unknown[]
beforeEach(() => {
  items = [playlist('likes', 'Likes', { type: 'LIKES', slug: null, trackCount: 7 }), playlist('road-trip', 'Road trip')]
  likedAlbums = []
  server.use(
    http.get(`${API}/playlists`, () => HttpResponse.json({ items, nextCursor: null })),
    http.get(`${API}/albums/liked`, () => HttpResponse.json({ items: likedAlbums, nextCursor: null })),
  )
})

describe('LibraryPage', () => {
  it('leads with Liked tracks (its count), then your playlists at their readable URLs', async () => {
    renderWithProviders(<LibraryPage />, { username: 'me' })

    expect(await screen.findByRole('link', { name: /Road trip/ })).toHaveAttribute('href', '/me/playlists/road-trip')
    expect(screen.getByRole('link', { name: /Liked tracks/ })).toHaveAttribute('href', '/liked')
    expect(screen.getByText('Playlist · 7 tracks')).toBeInTheDocument()
  })

  it('shows the albums you liked on a shelf', async () => {
    likedAlbums = [albumSummary('a1', { name: 'Loved album', likedByMe: true })]
    renderWithProviders(<LibraryPage />, { username: 'me' })

    expect(await screen.findByText('LIKED ALBUMS')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Loved album/ })).toBeInTheDocument()
  })

  it('leaves the shelf out when you have liked no albums', async () => {
    renderWithProviders(<LibraryPage />, { username: 'me' })
    await screen.findByRole('link', { name: /Road trip/ })
    expect(screen.queryByText('LIKED ALBUMS')).not.toBeInTheDocument()
  })

  it('opens New playlist', async () => {
    renderWithProviders(<LibraryPage />, { username: 'me' })
    await screen.findByRole('link', { name: /Road trip/ })

    await userEvent.click(screen.getByRole('button', { name: /New playlist/ }))

    expect(await screen.findByRole('dialog', { name: 'New playlist' })).toBeInTheDocument()
  })
})

describe('SidebarPlaylists', () => {
  it('lists only your custom playlists, the current one selected', async () => {
    renderWithProviders(<SidebarPlaylists />, { username: 'me', route: '/me/playlists/road-trip' })

    const link = await screen.findByRole('link', { name: /Road trip/ })
    expect(link).toHaveAttribute('href', '/me/playlists/road-trip')
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', { name: /^Likes/ })).not.toBeInTheDocument()
  })

  it('says when there are none yet', async () => {
    items = [playlist('likes', 'Likes', { type: 'LIKES' })]
    renderWithProviders(<SidebarPlaylists />)
    expect(await screen.findByText('No playlists yet')).toBeInTheDocument()
  })
})
