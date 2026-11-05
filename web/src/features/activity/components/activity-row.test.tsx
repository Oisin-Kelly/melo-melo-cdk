import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { userSummary } from '@/testing/fixtures'
import { renderWithProviders } from '@/testing/providers'
import type { ActivityEntry } from '../api/activity'
import { ActivityRow } from './activity-row'

const entry = (extra: Partial<ActivityEntry>): ActivityEntry => ({
  type: 'TRACK_LIKED',
  actor: userSummary('bob', { displayName: 'Bob' }),
  targetType: 'TRACK',
  targetId: 't1',
  targetName: 'My Song',
  targetOwner: 'me',
  targetSlug: 'my-song',
  createdAt: Date.now() - 60_000,
  ...extra,
})

describe('ActivityRow', () => {
  it.each<[Partial<ActivityEntry>, string, string]>([
    [{}, 'Bob liked your track My Song', '/me/my-song'],
    [{ type: 'ALBUM_LIKED', targetType: 'ALBUM', targetName: 'Summer', targetSlug: 'summer' }, 'Bob liked your album Summer', '/me/albums/summer'],
    [{ type: 'TRACK_SHARED', targetOwner: 'bob', targetSlug: 'demo', targetName: 'Demo' }, 'Bob shared Demo with you', '/bob/demo'],
    [{ type: 'ALBUM_SHARED', targetType: 'ALBUM', targetOwner: 'bob', targetSlug: 'eps', targetName: 'EPs' }, 'Bob shared the album EPs with you', '/bob/albums/eps'],
    [{ type: 'USER_FOLLOWED', targetType: 'USER', targetName: undefined }, 'Bob started following you', '/bob'],
  ])('%j reads "%s" and links to %s', (extra, sentence, href) => {
    renderWithProviders(<ActivityRow entry={entry(extra)} isUnread={false} />)

    const link = screen.getByRole('link')
    expect(link).toHaveTextContent(sentence)
    expect(link).toHaveAttribute('href', href)
  })

  it('links to the id route for an item without a slug', () => {
    renderWithProviders(<ActivityRow entry={entry({ targetSlug: undefined })} isUnread={false} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/tracks/t1')
  })

  it('marks unread rows', () => {
    const { rerender } = renderWithProviders(<ActivityRow entry={entry({})} isUnread />)
    expect(screen.getByRole('img', { name: 'New' })).toBeInTheDocument()

    rerender(<ActivityRow entry={entry({})} isUnread={false} />)
    expect(screen.queryByRole('img', { name: 'New' })).not.toBeInTheDocument()
  })
})
