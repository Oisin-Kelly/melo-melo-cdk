import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { sileo } from 'sileo'
import { describe, expect, it, vi } from 'vitest'
import type { Suggestion } from '@/lib/people'
import { userSummary } from '@/testing/fixtures'
import { LocationProbe, renderRoutes, renderWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { PeopleYouMayKnow, PeopleYouMayKnowPanel } from './people-you-may-know'
import { suggestionReason } from './suggestion-reason'

const anna = userSummary('anna', { displayName: 'Anna' })
const ben = userSummary('ben', { displayName: 'Ben' })
const suggestion = (username: string, extra: Partial<Suggestion> = {}): Suggestion => ({
  user: userSummary(username, { displayName: username[0].toUpperCase() + username.slice(1) }),
  reason: 'FOLLOWS_YOU',
  mutuals: [],
  mutualCount: 0,
  ...extra,
})

function serve(items: Suggestion[]) {
  server.use(http.get(`${API}/users/suggestions`, () => HttpResponse.json({ items })))
}

describe('suggestionReason', () => {
  it.each([
    [suggestion('x'), 'Follows you'],
    [suggestion('x', { reason: 'SHARED_WITH_YOU' }), 'Shared music with you'],
    [suggestion('x', { reason: 'YOU_SHARED' }), 'You shared with them'],
    [suggestion('x', { reason: 'MUTUALS', mutuals: [anna], mutualCount: 1 }), 'Followed by Anna'],
    [suggestion('x', { reason: 'MUTUALS', mutuals: [anna, ben], mutualCount: 2 }), 'Followed by Anna and Ben'],
    [suggestion('x', { reason: 'MUTUALS', mutuals: [anna, ben], mutualCount: 3 }), 'Followed by Anna and 2 others'],
  ])('%#: says why', (s, expected) => {
    expect(suggestionReason(s)).toBe(expected)
  })
})

describe('PeopleYouMayKnow', () => {
  it('shows each person and why', async () => {
    serve([suggestion('carol'), suggestion('dan', { reason: 'MUTUALS', mutuals: [anna], mutualCount: 1 })])
    renderWithProviders(<PeopleYouMayKnow />)

    expect(await screen.findByRole('heading', { name: 'People you may know' })).toBeInTheDocument()
    expect(screen.getByText('Carol')).toBeInTheDocument()
    expect(screen.getByText('Follows you')).toBeInTheDocument()
    expect(screen.getByText('Followed by Anna')).toBeInTheDocument()
  })

  it('shows nothing with no one to suggest', async () => {
    let asked = false
    server.use(
      http.get(`${API}/users/suggestions`, () => {
        asked = true
        return HttpResponse.json({ items: [] })
      }),
    )
    const { container } = renderWithProviders(<PeopleYouMayKnow />)
    await waitFor(() => expect(asked).toBe(true))
    expect(container).toBeEmptyDOMElement()
  })

  it('Follow follows them, and their card goes once your data refreshes', async () => {
    let followed: unknown
    let items = [suggestion('carol')]
    server.use(
      http.get(`${API}/users/suggestions`, () => HttpResponse.json({ items })),
      http.post(`${API}/users/carol/follow-user`, async ({ request }) => {
        followed = await request.json()
        items = []
        return HttpResponse.json({ newValue: true })
      }),
    )
    renderWithProviders(<PeopleYouMayKnow />)

    await userEvent.click(await screen.findByRole('button', { name: 'Follow' }))

    expect(followed).toEqual({ newValue: true })
    await waitFor(() => expect(screen.queryByText('Carol')).not.toBeInTheDocument())
  })

  it('✕ hides them at once, and brings them back if that fails', async () => {
    serve([suggestion('carol'), suggestion('dan')])
    let hide = 200
    server.use(http.post(`${API}/users/suggestions/:username/hide`, () => HttpResponse.json({}, { status: hide })))
    renderWithProviders(<PeopleYouMayKnow />)

    await userEvent.click(await screen.findByRole('button', { name: 'Hide Carol' }))
    expect(screen.queryByText('Carol')).not.toBeInTheDocument()
    expect(screen.getByText('Dan')).toBeInTheDocument()

    hide = 500
    await userEvent.click(screen.getByRole('button', { name: 'Hide Dan' }))
    expect(await screen.findByText('Dan')).toBeInTheDocument()
    expect(sileo.error).toHaveBeenCalledWith({ title: "Couldn't hide that", description: 'Please try again.' })
  })
})

describe('PeopleYouMayKnowPanel (Home, wide screens)', () => {
  it('lists each person with why, and Hide takes them out', async () => {
    serve([suggestion('carol'), suggestion('dan', { reason: 'SHARED_WITH_YOU' })])
    server.use(http.post(`${API}/users/suggestions/:username/hide`, () => HttpResponse.json({})))
    renderWithProviders(<PeopleYouMayKnowPanel />)

    expect(await screen.findByText('Shared music with you')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Follow' })).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Hide Carol' }))
    expect(screen.queryByText('Carol')).not.toBeInTheDocument()
  })

  it('always offers an invite link to your profile, even with no one to suggest', async () => {
    serve([])
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderWithProviders(<PeopleYouMayKnowPanel />)

    await userEvent.click(screen.getByRole('button', { name: 'Copy invite link' }))

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/me`)
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Follow' })).not.toBeInTheDocument()
  })

  it('a row opens their profile; its Follow doesn\'t', async () => {
    serve([suggestion('carol')])
    server.use(http.post(`${API}/users/carol/follow-user`, () => HttpResponse.json({ newValue: true })))
    const { router } = renderRoutes(
      [
        { path: '/', element: <PeopleYouMayKnowPanel /> },
        { path: '/:username', element: <LocationProbe /> },
      ],
      { initialEntries: ['/'] },
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Follow' }))
    expect(router.state.location.pathname).toBe('/')

    await userEvent.click(screen.getByText('Carol'))
    expect(router.state.location.pathname).toBe('/carol')
  })
})
