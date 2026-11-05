import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { sileo } from 'sileo'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LinkPreview, LinkViewer } from '@/lib/share-links'
import { readPendingInvitePath } from '@/lib/share-links'
import { userSummary } from '@/testing/fixtures'
import { LocationProbe, renderRoutes } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { InvitePage } from './invite-page'

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv'
const DAY = 24 * 60 * 60_000
const sender = userSummary('oisin', { displayName: 'Oisín Kelly' })

const validTrack = (extra: Partial<Extract<LinkPreview, { state: 'VALID' }>> = {}): LinkPreview => ({
  state: 'VALID',
  kind: 'TRACK',
  sender,
  name: 'Night Drive',
  duration: 242,
  genre: 'Electronic',
  expiresAt: Date.now() + 3 * DAY,
  allowPreview: true,
  tracks: [{ id: 't1', name: 'Night Drive', duration: 242, preview: { url: 'https://s3/clip', isFullTrack: false } }],
  ...extra,
})

const validAlbum: LinkPreview = {
  state: 'VALID',
  kind: 'ALBUM',
  sender,
  name: "Demos '26",
  duration: 780,
  expiresAt: Date.now() + 3 * DAY,
  allowPreview: true,
  tracks: [
    { id: 't1', name: 'Cabin Intro', duration: 25, preview: { url: 'https://s3/full', isFullTrack: true } },
    { id: 't2', name: 'Kitchen Light', duration: 185, preview: { url: 'https://s3/clip', isFullTrack: false } },
  ],
}

const target = { kind: 'TRACK' as const, id: 't1', owner: 'oisin', slug: 'night-drive' }

function serve(preview: LinkPreview, viewer?: LinkViewer | 404) {
  server.use(
    http.get(`${API}/links/${TOKEN}`, () => HttpResponse.json(preview)),
    http.get(`${API}/links/${TOKEN}/viewer`, () =>
      viewer === 404 || !viewer
        ? HttpResponse.json({ statusCode: 404, message: 'x', error: 'Not Found' }, { status: 404 })
        : HttpResponse.json(viewer),
    ),
  )
}

function renderInvite({ username = 'ronan' as string | null } = {}) {
  const result = renderRoutes(
    [
      { path: '/s/:token', element: <InvitePage /> },
      { path: '*', element: <LocationProbe /> },
    ],
    { initialEntries: [`/s/${TOKEN}`], username },
  )
  return { ...result, user: userEvent.setup() }
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(window.HTMLMediaElement.prototype, 'play')
})
afterEach(() => vi.restoreAllMocks())

describe('InvitePage — signed out', () => {
  it('shows who shared what, with sign-up and sign-in that come back here', async () => {
    serve(validTrack())
    renderInvite({ username: null })

    expect(await screen.findByRole('heading', { name: 'Night Drive' })).toBeInTheDocument()
    expect(screen.getByText(/shared a track with you/)).toBeInTheDocument()
    expect(screen.getByText('Oisín Kelly · 4:02 · Electronic')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create an account to keep it' })).toHaveAttribute(
      'href',
      `/signup?next=${encodeURIComponent(`/s/${TOKEN}`)}`,
    )
    expect(screen.getByRole('link', { name: 'I already have an account' })).toHaveAttribute(
      'href',
      `/login?next=${encodeURIComponent(`/s/${TOKEN}`)}`,
    )
    expect(screen.getByText('Link expires in 3 days')).toBeInTheDocument()
  })

  it("shows the sender's caption", async () => {
    serve(validTrack({ caption: 'for the drive home' }))
    renderInvite({ username: null })
    expect(await screen.findByText('for the drive home')).toBeInTheDocument()
  })

  it('remembers the invite, so finishing sign-up in another tab still comes back', async () => {
    serve(validTrack())
    renderInvite({ username: null })
    await screen.findByRole('heading', { name: 'Night Drive' })
    expect(readPendingInvitePath()).toBe(`/s/${TOKEN}`)
  })

  it('plays the 30s preview from the cover', async () => {
    serve(validTrack())
    const { user } = renderInvite({ username: null })
    await user.click(await screen.findByRole('button', { name: 'Play preview' }))
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Stop preview' })).toBeInTheDocument()
  })

  it('a short track plays in full', async () => {
    serve(validTrack({ tracks: [{ id: 't1', name: 'Jingle', duration: 20, preview: { url: 'https://s3/full', isFullTrack: true } }] }))
    renderInvite({ username: null })
    expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('preview off: no play button, and says why', async () => {
    serve(validTrack({ allowPreview: false, tracks: [{ id: 't1', name: 'Night Drive', duration: 242, preview: null }] }))
    renderInvite({ username: null })
    expect(await screen.findByText(/Preview is off for this link/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Play/ })).not.toBeInTheDocument()
  })
})

describe('InvitePage — signed in', () => {
  it('adds it to your library, then offers Open and Undo', async () => {
    serve(validTrack(), { relation: 'NONE', target })
    let accepted = false
    let undone = false
    server.use(
      http.post(`${API}/links/${TOKEN}/accept`, () => {
        accepted = true
        return HttpResponse.json(target)
      }),
      http.delete(`${API}/tracks/shared/t1`, () => {
        undone = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { user } = renderInvite()

    expect(await screen.findByText(/Signed in as @ronan/)).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Add to my library' }))

    expect(await screen.findByText('Added to your library')).toBeInTheDocument()
    expect(accepted).toBe(true)
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/oisin/night-drive')

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await vi.waitFor(() => expect(undone).toBe(true))
    expect(sileo.success).toHaveBeenCalledWith({ title: 'Removed from your library', description: 'Night Drive' })
  })

  it('Not now leaves without adding, and forgets the invite', async () => {
    serve(validTrack(), { relation: 'NONE', target })
    localStorage.setItem('mm-pending-invite', JSON.stringify({ token: TOKEN, savedAt: Date.now() }))
    const { user, router } = renderInvite()
    await user.click(await screen.findByRole('button', { name: 'Not now' }))
    expect(router.state.location.pathname).toBe('/')
    expect(readPendingInvitePath()).toBeNull()
  })

  it('already have it: just Open', async () => {
    serve(validTrack(), { relation: 'ALREADY_HAVE', target })
    renderInvite()
    expect(await screen.findByText('You already have this')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add to my library' })).not.toBeInTheDocument()
  })

  it('your own link: its stats, Open and Manage links', async () => {
    serve(validTrack(), {
      relation: 'OWN',
      target,
      link: {
        token: TOKEN, kind: 'TRACK', targetId: 't1', createdAt: Date.now(), expiresAt: Date.now() + 5 * DAY,
        allowPreview: true, acceptedCount: 3, state: 'ACTIVE',
      },
    })
    renderInvite({ username: 'oisin' })
    expect(await screen.findByText('THIS IS YOUR TRACK')).toBeInTheDocument()
    expect(screen.getByText('This link: 3 added · expires in 5 days · preview on')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage links' })).toHaveAttribute('href', '/oisin/night-drive?share=links')
  })

  it('signed in, the remembered invite is done with — even on your own link', async () => {
    localStorage.setItem('mm-pending-invite', JSON.stringify({ token: TOKEN, savedAt: Date.now() }))
    serve(validTrack(), { relation: 'OWN', target })
    renderInvite({ username: 'oisin' })
    await screen.findByRole('link', { name: 'Manage links' })
    expect(readPendingInvitePath()).toBeNull()
  })

  it("a failed viewer check that isn't a 404 offers a retry, not \"isn't available\"", async () => {
    serve(validTrack())
    server.use(http.get(`${API}/links/${TOKEN}/viewer`, () => HttpResponse.error()))
    renderInvite()
    expect(await screen.findByText("Couldn't load this link")).toBeInTheDocument()
    expect(screen.queryByText("This link isn't available")).not.toBeInTheDocument()
  })

  it('a link that stops working while open: says so, with the expired card', async () => {
    serve(validTrack(), { relation: 'NONE', target })
    server.use(
      http.post(`${API}/links/${TOKEN}/accept`, () => {
        // The link expired meanwhile: the preview now says so too
        server.use(
          http.get(`${API}/links/${TOKEN}`, () =>
            HttpResponse.json({ state: 'EXPIRED', kind: 'TRACK', sender, expiresAt: Date.now() - 1 }),
          ),
        )
        return HttpResponse.json({ statusCode: 410, message: 'This link has expired', error: 'Gone' }, { status: 410 })
      }),
    )
    const { user } = renderInvite()
    await user.click(await screen.findByRole('button', { name: 'Add to my library' }))

    expect(await screen.findByText("Couldn't add it")).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'This link has expired' })).toBeInTheDocument()
  })

  it('an album: Preview all, and a play button on each row', async () => {
    serve(validAlbum, { relation: 'NONE', target: { kind: 'ALBUM', id: 'a1', owner: 'oisin' } })
    const { user } = renderInvite()

    expect(await screen.findByRole('heading', { name: "Demos '26" })).toBeInTheDocument()
    expect(screen.getByText('Oisín Kelly · 2 tracks · 13 min')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play Cabin Intro' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Add album to my library' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Preview all' }))
    expect(screen.getByRole('button', { name: 'Stop Cabin Intro' })).toBeInTheDocument()
  })
})

describe('InvitePage — dead links', () => {
  it('expired: who sent it, but nothing about what it was', async () => {
    serve({ state: 'EXPIRED', kind: 'TRACK', sender, expiresAt: Date.now() - DAY })
    renderInvite({ username: null })
    expect(await screen.findByRole('heading', { name: 'This link has expired' })).toBeInTheDocument()
    expect(screen.getByText(/Ask Oisín Kelly to send you a new one/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to MeloMelo' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('button', { name: /Ask/ })).not.toBeInTheDocument()
  })

  it('unavailable: no sender, and the invite is forgotten', async () => {
    localStorage.setItem('mm-pending-invite', JSON.stringify({ token: TOKEN, savedAt: Date.now() }))
    serve({ state: 'UNAVAILABLE' })
    renderInvite()
    expect(await screen.findByText("This link isn't available")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to your library' })).toHaveAttribute('href', '/library')
    expect(readPendingInvitePath()).toBeNull()
  })
})
