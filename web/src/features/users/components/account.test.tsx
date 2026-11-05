import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeModeProvider } from '@/components/theme/theme-mode'
import { ThemeModeMenu } from '@/components/theme/theme-mode-menu'
import { user } from '@/testing/fixtures'
import { LocationProbe, renderWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { ProfileButton } from './profile-button'
import { SettingsPage } from './settings-page'
import { UserMenu } from './user-menu'

beforeEach(() => {
  localStorage.clear()
  server.use(http.get(`${API}/users/me`, () => HttpResponse.json(user('me', { displayName: 'Me' }))))
})

const withTheme = (ui: React.ReactElement) => <ThemeModeProvider>{ui}</ThemeModeProvider>

describe('SettingsPage', () => {
  it('links to Edit profile, switches appearance, and signs out to the landing page', async () => {
    const signOut = vi.fn(async () => {})
    const u = userEvent.setup()
    renderWithProviders(
      withTheme(
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>,
      ),
      { route: '/settings', signOut },
    )

    expect(screen.getByRole('link', { name: /Edit profile/ })).toHaveAttribute('href', '/settings/profile')

    await u.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(localStorage.getItem('melomelo.theme-mode')).toBe('dark')

    await u.click(screen.getByRole('button', { name: /Sign out/ }))
    // Asks first: nothing happens until it's confirmed
    const confirm = await screen.findByRole('alertdialog', { name: 'Sign out?' })
    expect(signOut).not.toHaveBeenCalled()
    await u.click(within(confirm).getByRole('button', { name: 'Sign out' }))
    await vi.waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/))
    expect(signOut).toHaveBeenCalled()
  })
})

describe('UserMenu (desktop avatar)', () => {
  it('offers your profile, Edit profile and Sign out', async () => {
    const signOut = vi.fn(async () => {})
    const u = userEvent.setup()
    renderWithProviders(<UserMenu />, { signOut })

    await u.click(await screen.findByRole('button', { name: /Me/ }))

    expect(await screen.findByRole('menuitem', { name: /View profile/ })).toHaveAttribute('href', '/me')
    expect(screen.getByRole('menuitem', { name: /Edit profile/ })).toHaveAttribute('href', '/settings/profile')
    await u.click(screen.getByRole('menuitem', { name: /Sign out/ }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Sign out?' })
    expect(signOut).not.toHaveBeenCalled()
    await u.click(within(confirm).getByRole('button', { name: 'Sign out' }))
    await vi.waitFor(() => expect(signOut).toHaveBeenCalled())
  })
})

describe('ProfileButton (phone avatar)', () => {
  it('is a link to your profile', async () => {
    renderWithProviders(<ProfileButton />)
    expect(await screen.findByRole('link', { name: /Me — your profile/ })).toHaveAttribute('href', '/me')
  })
})

describe('ThemeModeMenu', () => {
  it('switches the appearance from the header', async () => {
    const u = userEvent.setup()
    renderWithProviders(withTheme(<ThemeModeMenu />))

    await u.click(screen.getByRole('button'))
    await u.click(await screen.findByRole('menuitem', { name: /Light/ }))

    expect(localStorage.getItem('melomelo.theme-mode')).toBe('light')
  })
})
