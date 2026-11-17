import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeModeProvider } from '@/components/theme/theme-mode'
import { ThemeModeMenu } from '@/components/theme/theme-mode-menu'
import { user } from '@/testing/fixtures'
import { LocationProbe, renderWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { ProfileButton } from './profile-button'
import { DisplayPrefsProvider } from '@/components/theme/display-prefs'
import { AppearancePage } from './appearance'
import { SettingsPage } from './settings-page'
import { UserMenu } from './user-menu'

beforeEach(() => {
  localStorage.clear()
  server.use(http.get(`${API}/users/me`, () => HttpResponse.json(user('me', { displayName: 'Me' }))))
})

const withTheme = (ui: React.ReactElement) => <ThemeModeProvider>{ui}</ThemeModeProvider>

describe('SettingsPage', () => {
  it('links to each screen, and signs out to the landing page', async () => {
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

    // Appearance is its own screen, the row showing the current choice
    expect(screen.getByRole('link', { name: /Appearance/ })).toHaveAttribute('href', '/settings/appearance')
    expect(screen.getByRole('link', { name: /Appearance/ })).toHaveTextContent('Automatic')

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
  it('says who you are (opening your profile), then Edit profile and Sign out', async () => {
    const signOut = vi.fn(async () => {})
    const u = userEvent.setup()
    renderWithProviders(<UserMenu />, { signOut })

    await u.click(await screen.findByRole('button', { name: /Me/ }))

    const me = await screen.findByRole('menuitem', { name: /@me/ })
    expect(me).toHaveAttribute('href', '/me')
    expect(me).toHaveTextContent(/Me\s*@me/)
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

describe('AppearancePage', () => {
  const withPrefs = (ui: React.ReactElement) => withTheme(<DisplayPrefsProvider>{ui}</DisplayPrefsProvider>)
  afterEach(() => {
    delete document.documentElement.dataset.mmTextSize
    delete document.documentElement.dataset.mmDensity
  })

  it('switches light / dark / automatic', async () => {
    const u = userEvent.setup()
    renderWithProviders(withPrefs(<AppearancePage />))

    await u.click(screen.getByRole('radio', { name: 'Dark' }))

    expect(localStorage.getItem('melomelo.theme-mode')).toBe('dark')
  })

  it('picks a text size and a density (shown as previews), and the Settings row sums them up', async () => {
    const u = userEvent.setup()
    renderWithProviders(withPrefs(<><AppearancePage /><SettingsPage /></>))

    await u.click(screen.getByRole('radio', { name: 'Large' }))
    await u.click(screen.getByText('Compact', { selector: 'span, p, div' }))

    expect(document.documentElement.dataset.mmTextSize).toBe('large')
    expect(document.documentElement.dataset.mmDensity).toBe('compact')
    expect(screen.getByRole('link', { name: /Appearance/ })).toHaveTextContent('Automatic · Large text · Compact')
  })
})
