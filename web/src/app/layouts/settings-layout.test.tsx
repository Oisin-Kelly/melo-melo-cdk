import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeModeProvider } from '@/components/theme/theme-mode'
import * as mobile from '@/hooks/use-is-mobile'
import { renderRoutes } from '@/testing/providers'
import { SettingsIndex, SettingsLayout } from './settings-layout'

vi.mock('@/hooks/use-is-mobile', () => ({ useIsMobile: vi.fn(() => false) }))
// Desktop /settings shows the profile section in place; it's tested on its own
vi.mock('@/features/users/components/edit-profile-page', () => ({ EditProfilePage: () => <h1>Edit profile</h1> }))

beforeEach(() => vi.mocked(mobile.useIsMobile).mockReturnValue(false))

// The sections themselves are tested elsewhere; here each just says which one it is
function renderAt(path: string) {
  return renderRoutes(
    [
      {
        path: '/settings',
        element: (
          <ThemeModeProvider>
            <SettingsLayout />
          </ThemeModeProvider>
        ),
        children: [
          { index: true, element: <SettingsIndex /> },
          { path: 'profile', element: <p>Profile section</p> },
          { path: 'password', element: <p>Password section</p> },
          { path: 'two-step', element: <p>Two-step section</p> },
          { path: 'appearance', element: <p>Appearance section</p> },
        ],
      },
    ],
    { initialEntries: [path] },
  )
}

const sectionList = () => screen.getByRole('heading', { name: 'Settings', level: 2 }).parentElement!

describe('SettingsLayout on wider screens', () => {
  it('opens on Profile in place (no redirect), with every section in the list beside it', async () => {
    const { router } = renderAt('/settings')

    expect(await screen.findByRole('heading', { name: 'Edit profile' })).toBeInTheDocument()
    // Still /settings, so Back from a section returns here even if the window narrows to a phone
    expect(router.state.location.pathname).toBe('/settings')
    for (const name of ['Profile', 'Password', 'Two-step verification', 'Appearance'])
      expect(within(sectionList()).getByRole('link', { name })).toBeInTheDocument()
  })

  it('shows the section in the URL, and switches from the list', async () => {
    const user = userEvent.setup()
    const { router } = renderAt('/settings/two-step')
    expect(await screen.findByText('Two-step section')).toBeInTheDocument()

    await user.click(within(sectionList()).getByRole('link', { name: 'Appearance' }))

    expect(await screen.findByText('Appearance section')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/settings/appearance')
  })

  it('signs out behind the usual confirm', async () => {
    const user = userEvent.setup()
    renderAt('/settings/profile')
    await screen.findByText('Profile section')

    await user.click(within(sectionList()).getByText('Sign out'))

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Sign out?')
  })
})

describe('SettingsLayout on phones', () => {
  beforeEach(() => vi.mocked(mobile.useIsMobile).mockReturnValue(true))

  it('keeps /settings as the list to drill down from', async () => {
    renderAt('/settings')
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Edit profile/ })).toBeInTheDocument()
    expect(screen.queryByText('Profile section')).not.toBeInTheDocument()
  })

  it('shows a section on its own, without the side list', async () => {
    renderAt('/settings/password')
    expect(await screen.findByText('Password section')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Settings', level: 2 })).not.toBeInTheDocument()
  })
})
