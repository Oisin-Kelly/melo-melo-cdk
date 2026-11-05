import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { sileo } from 'sileo'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShareLink } from '@/lib/share-links'
import { renderWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import type { Recipient, ShareChange } from '@/types/api'
import { ShareDialog, type ShareTab } from './share-dialog'

const DAY = 86_400_000
const link = (token: string, extra: Partial<ShareLink> = {}): ShareLink => ({
  token,
  kind: 'TRACK',
  targetId: 't1',
  createdAt: Date.UTC(2026, 10, 2),
  expiresAt: Date.now() + 5 * DAY,
  allowPreview: true,
  acceptedCount: 3,
  state: 'ACTIVE',
  ...extra,
})

let links: ShareLink[] = []

beforeEach(() => {
  links = [link('AAAAAAAAAAAAAAAAAAAAAA'), link('BBBBBBBBBBBBBBBBBBBBBB', { state: 'REVOKED' })]
  server.use(
    http.get(`${API}/links`, ({ request }) => {
      const url = new URL(request.url)
      expect(url.searchParams.get('kind')).toBe('TRACK')
      expect(url.searchParams.get('targetId')).toBe('t1')
      return HttpResponse.json({ items: links })
    }),
  )
})

// The Share dialog on its Link tab (how "Manage links" opens it), with the People tab's
// queries stubbed — these tests are about links
function renderSection({ isShortTrack = false, initialTab = 'link' as ShareTab } = {}) {
  const recipients = { data: [], isPending: false, isError: false } as unknown as UseQueryResult<Recipient[]>
  const share = { mutate: vi.fn(), isPending: false } as unknown as UseMutationResult<unknown, Error, ShareChange>
  renderWithProviders(
    <ShareDialog
      isOpen
      onOpenChange={() => {}}
      name="Night Drive"
      kind="track"
      subtitle="x"
      recipients={recipients}
      share={share}
      links={{ kind: 'TRACK', id: 't1', isShortTrack }}
      initialTab={initialTab}
    />,
    { username: 'me' },
  )
  return userEvent.setup()
}

describe('Share dialog — Link tab', () => {
  it('People and Link are separate tabs, each with its own button', async () => {
    const user = renderSection({ initialTab: 'people' })
    expect(screen.getByRole('combobox', { name: 'Add people' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create link' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Link' }))
    expect(await screen.findByRole('button', { name: 'Create link' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Add people' })).not.toBeInTheDocument()
  })

  it('lists active links only, with what each one is doing', async () => {
    renderSection()
    expect(await screen.findByText('5 days left · preview on · 3 added')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(1)
  })

  it('creates a link with the chosen expiry and preview setting, and copies it', async () => {
    let body: unknown
    server.use(
      http.post(`${API}/links`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(link('CCCCCCCCCCCCCCCCCCCCCC'), { status: 201 })
      }),
    )
    const user = renderSection()

    await user.click(await screen.findByRole('radio', { name: '24 hours' }))
    await user.click(screen.getByRole('switch', { name: /Allow preview/ }))
    await user.type(screen.getByRole('textbox', { name: /Caption/ }), 'for the drive home')
    await user.click(screen.getByRole('button', { name: 'Create link' }))

    // userEvent installs its own clipboard
    await vi.waitFor(async () =>
      expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/s/CCCCCCCCCCCCCCCCCCCCCC`),
    )
    expect(body).toEqual({ kind: 'TRACK', targetId: 't1', expiresIn: '24h', allowPreview: false, caption: 'for the drive home' })
  })

  it('Copy says Copied on the button — no toast behind the dialog', async () => {
    const user = renderSection()
    await user.click(await screen.findByRole('button', { name: 'Copy' }))
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/s/AAAAAAAAAAAAAAAAAAAAAA`)
    expect(sileo.success).not.toHaveBeenCalled()
  })

  it('revoking acts at once; the row stays with Undo until the dialog closes', async () => {
    let revoked = false
    let restored = false
    server.use(
      http.delete(`${API}/links/AAAAAAAAAAAAAAAAAAAAAA`, () => {
        revoked = true
        links = [link('AAAAAAAAAAAAAAAAAAAAAA', { state: 'REVOKED' })]
        return HttpResponse.json(links[0])
      }),
      http.post(`${API}/links/AAAAAAAAAAAAAAAAAAAAAA/restore`, () => {
        restored = true
        links = [link('AAAAAAAAAAAAAAAAAAAAAA')]
        return HttpResponse.json(links[0])
      }),
    )
    const user = renderSection()

    await user.click(await screen.findByRole('button', { name: 'Revoke' }))
    expect(await screen.findByText('Revoked — no one new can use it')).toBeInTheDocument()
    expect(revoked).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await vi.waitFor(() => expect(restored).toBe(true))
    expect(await screen.findByRole('button', { name: 'Revoke' })).toBeInTheDocument()
    expect(sileo.success).not.toHaveBeenCalled()
  })

  it("a failed create says so in the dialog", async () => {
    server.use(http.post(`${API}/links`, () => HttpResponse.json({ statusCode: 500, message: 'x', error: 'x' }, { status: 500 })))
    const user = renderSection()
    await user.click(await screen.findByRole('button', { name: 'Create link' }))
    expect(await screen.findAllByText("Couldn't create a link. Please try again.")).not.toHaveLength(0)
  })

  it('says a short track plays in full', async () => {
    renderSection({ isShortTrack: true })
    expect(await screen.findByText('Plays in full before adding')).toBeInTheDocument()
  })
})
