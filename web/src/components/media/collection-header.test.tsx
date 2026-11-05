import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as compact from '@/hooks/use-is-compact'
import { renderWithProviders } from '@/testing/providers'
import { CollectionHeader } from './collection-header'

vi.mock('@/hooks/use-is-compact', () => ({ useIsCompact: vi.fn(() => false) }))
const setCompact = (value: boolean) => vi.mocked(compact.useIsCompact).mockReturnValue(value)

function renderHeader(description?: string) {
  return renderWithProviders(
    <CollectionHeader
      kind="Playlist"
      title="Road Trip"
      imageUrl={null}
      imageBgColor={null}
      meta="5 tracks · 4 min"
      actions={<button type="button">Edit</button>}
      play={{ label: 'Play playlist', text: 'Play all' }}
      description={description}
    />,
  )
}

describe('CollectionHeader', () => {
  beforeEach(() => setCompact(false))

  it('wide: the kind label, and play as a "Play all" pill', () => {
    renderHeader()
    expect(screen.getByText('PLAYLIST')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play all' })).toBeInTheDocument()
  })

  it('compact: the kind leads the meta line, a round play button, and the description as one flowing preview', () => {
    setCompact(true)
    renderHeader('desc\n\n\nDescription extra')
    expect(screen.queryByText('PLAYLIST')).not.toBeInTheDocument()
    // Each piece is its own span (kept whole), so match on the whole line's text
    expect(screen.getByText((_, el) => el?.textContent === 'Playlist · 5 tracks · 4 min' && el.tagName !== 'DIV')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Road Trip' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play playlist' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Play all' })).not.toBeInTheDocument()
    expect(screen.getByText('desc Description extra')).toBeInTheDocument()
  })
})
