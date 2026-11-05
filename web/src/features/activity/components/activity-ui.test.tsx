import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as mobile from '@/hooks/use-is-mobile'
import { user, userSummary } from '@/testing/fixtures'
import { renderWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import type { ActivityEntry } from '../api/activity'
import { ActivityPage } from './activity-page'
import { NotificationsPopover } from './notifications-popover'

vi.mock('@/hooks/use-is-mobile', () => ({ useIsMobile: vi.fn(() => false) }))

const like = (createdAt: number, actor = 'bob'): ActivityEntry => ({
  type: 'TRACK_LIKED',
  actor: userSummary(actor, { displayName: actor.toUpperCase() }),
  targetType: 'TRACK',
  targetId: `t${createdAt}`,
  targetName: `Song ${createdAt}`,
  createdAt,
})

let seenPosts = 0

function serveActivity(items: ActivityEntry[], activitySeenAt: number) {
  server.use(
    http.get(`${API}/users/me`, () => HttpResponse.json(user('me', { activitySeenAt }))),
    http.get(`${API}/activity`, () => HttpResponse.json({ items, nextCursor: null })),
    http.post(`${API}/me/activity-seen`, () => {
      seenPosts++
      return new HttpResponse(null, { status: 204 })
    }),
  )
}

beforeEach(() => {
  seenPosts = 0
  vi.mocked(mobile.useIsMobile).mockReturnValue(false)
})

describe('NotificationsPopover', () => {
  it('badges the bell with the unread count', async () => {
    serveActivity([like(30), like(20), like(10)], 15)
    renderWithProviders(<NotificationsPopover />)
    expect(await screen.findByRole('button', { name: 'Activity, 2 new' })).toBeInTheDocument()
  })

  it('opening it lists the activity, marks it seen, and keeps the "new" dots while open', async () => {
    serveActivity([like(30), like(10)], 15)
    renderWithProviders(<NotificationsPopover />)

    await userEvent.click(await screen.findByRole('button', { name: 'Activity, 1 new' }))

    expect(await screen.findByText('Song 30')).toBeInTheDocument()
    await vi.waitFor(() => expect(seenPosts).toBe(1))
    expect(screen.getAllByRole('img', { name: 'New' })).toHaveLength(1)
    expect(await screen.findByRole('button', { name: 'Activity' })).toBeInTheDocument() // badge cleared
  })

  it('is a link to the Activity screen on phones', async () => {
    vi.mocked(mobile.useIsMobile).mockReturnValue(true)
    serveActivity([], 0)
    renderWithProviders(<NotificationsPopover />)
    expect(await screen.findByRole('link', { name: /Activity/ })).toHaveAttribute('href', '/activity')
  })
})

describe('ActivityPage', () => {
  it('lists everything, marks it seen once, and keeps the dots on what was new', async () => {
    serveActivity([like(30), like(20), like(10)], 15)
    renderWithProviders(<ActivityPage />)

    expect(await screen.findByText('Song 30')).toBeInTheDocument()
    await vi.waitFor(() => expect(seenPosts).toBe(1))
    expect(screen.getAllByRole('img', { name: 'New' })).toHaveLength(2)
  })

  it('does not post when nothing is unread', async () => {
    serveActivity([like(10)], 50)
    renderWithProviders(<ActivityPage />)
    await screen.findByText('Song 10')
    await new Promise((r) => setTimeout(r, 30))
    expect(seenPosts).toBe(0)
  })

  it('says when there is nothing yet', async () => {
    serveActivity([], 0)
    renderWithProviders(<ActivityPage />)
    expect(await screen.findByText('No activity yet')).toBeInTheDocument()
  })
})
