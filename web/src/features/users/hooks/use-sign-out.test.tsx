import { act, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LocationProbe, renderWithProviders } from '@/testing/providers'
import { useSignOut } from './use-sign-out'

function SignOut() {
  const signOut = useSignOut()
  return (
    <>
      <button onClick={() => void signOut()}>Sign out</button>
      <LocationProbe />
    </>
  )
}

describe('useSignOut', () => {
  it('signs out, then lands on the landing page', async () => {
    const signOut = vi.fn(async () => {})
    renderWithProviders(<SignOut />, { route: '/settings', signOut })

    await act(async () => screen.getByRole('button').click())

    expect(signOut).toHaveBeenCalled()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
  })
})
