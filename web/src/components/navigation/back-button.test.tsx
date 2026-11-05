import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as mobile from '@/hooks/use-is-mobile'
import { LocationProbe, renderWithProviders } from '@/testing/providers'
import { BackButton } from './back-button'

vi.mock('@/hooks/use-is-mobile', () => ({ useIsMobile: vi.fn(() => true) }))

afterEach(() => window.history.replaceState(null, ''))

function renderAt(entries: string[]) {
  return renderWithProviders(
    <Routes>
      <Route
        path="*"
        element={
          <>
            <BackButton fallback="/library" className="mm-page-back" />
            <LocationProbe />
          </>
        }
      />
    </Routes>,
    { route: entries },
  )
}

describe('BackButton', () => {
  it('renders nothing on wider screens (they have the side nav and browser back)', () => {
    vi.mocked(mobile.useIsMobile).mockReturnValueOnce(false)
    const { container } = renderAt(['/x'])
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
    expect(container.querySelector('.mm-page-back')).toBeNull()
  })

  it('goes back when the previous page is in the app', async () => {
    window.history.replaceState({ idx: 1 }, '')
    renderAt(['/library', '/oisin/my-song'])

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/library')
  })

  it('goes to the fallback when opened from a link (going back would leave the site)', async () => {
    window.history.replaceState({ idx: 0 }, '')
    renderAt(['/oisin/my-song'])

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/library')
  })
})
