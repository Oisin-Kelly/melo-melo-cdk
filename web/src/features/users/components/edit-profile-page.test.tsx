import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { sileo } from 'sileo'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LIMITS } from '@/config/limits'
import { user } from '@/testing/fixtures'
import { fieldErrors, fieldMessage } from '@/testing/messages'
import { LocationProbe, renderRoutes } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { EditProfilePage } from './edit-profile-page'

let updates: Record<string, unknown>[] = []

beforeEach(() => {
  updates = []
  server.use(
    http.get(`${API}/users/me`, () =>
      HttpResponse.json(user('me', { displayName: 'Oisín', city: 'Dublin', incomingShares: 'EVERYONE' })),
    ),
    http.post(`${API}/profile/update`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      updates.push(body)
      return HttpResponse.json(user('me', { displayName: body.displayName as string }))
    }),
  )
})

// Settings → Edit profile, so "leaving" has somewhere to go back to
function renderPage() {
  const result = renderRoutes(
    [
      { path: '/settings', element: <LocationProbe /> },
      { path: '/settings/profile', element: <EditProfilePage /> },
      { path: '/library', element: <LocationProbe /> },
    ],
    { initialEntries: ['/settings', '/settings/profile'], initialIndex: 1 },
  )
  return { ...result, user: userEvent.setup() }
}

describe('EditProfilePage', () => {
  it('starts from your current profile', async () => {
    renderPage()
    expect(await screen.findByLabelText(/Display name/)).toHaveValue('Oisín')
    expect(screen.getByLabelText(/City/)).toHaveValue('Dublin')
    expect(screen.getByRole('radio', { name: 'Everyone' })).toBeChecked()
  })

  it('saves the whole profile (blanks as null), says so and goes back', async () => {
    const { user, router } = renderPage()
    await user.clear(await screen.findByLabelText(/Display name/))
    await user.type(screen.getByLabelText(/Display name/), 'O. Kelly')
    await user.clear(screen.getByLabelText(/City/))
    await user.click(screen.getByRole('radio', { name: 'People you follow' }))

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(updates).toEqual([
      {
        displayName: 'O. Kelly',
        firstName: null,
        lastName: null,
        city: null,
        country: null,
        bio: null,
        incomingShares: 'FOLLOWING',
        clearedImage: false,
      },
    ])
    expect(sileo.success).toHaveBeenCalledWith({ title: 'Profile saved' })
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/settings'))
  })

  it('blocks saving past a field limit, saying which', async () => {
    const { user } = renderPage()
    const city = await screen.findByLabelText(/City/)

    await user.type(city, 'x'.repeat(LIMITS.profileField))

    expect(screen.getAllByText(`Keep it to ${LIMITS.profileField} characters.`).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('shows a too-long bio under the bio only', async () => {
    const { user } = renderPage()
    await user.click(await screen.findByLabelText(/Bio/))

    await user.paste('x'.repeat(LIMITS.bio + 1))

    expect(fieldMessage(/Bio/)).toBe(`Keep it to ${LIMITS.bio} characters.`)
    expect(fieldErrors()).toEqual([`Keep it to ${LIMITS.bio} characters.`])
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('asks before leaving with unsaved changes, and stays if you say so', async () => {
    const { user, router } = renderPage()
    await user.type(await screen.findByLabelText(/Bio/), 'Hello')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(router.state.location.pathname).toBe('/settings/profile')

    await user.click(within(dialog).getByRole('button', { name: /Keep editing|Cancel/ }))
    expect(router.state.location.pathname).toBe('/settings/profile')
    expect(screen.getByLabelText(/Bio/)).toHaveValue('Hello')
  })

  it('leaves if you confirm discarding', async () => {
    const { user, router } = renderPage()
    await user.type(await screen.findByLabelText(/Bio/), 'Hello')
    void router.navigate('/library')

    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /Discard/ }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/library'))
  })

  it('leaves without asking when nothing changed', async () => {
    const { user, router } = renderPage()
    await screen.findByLabelText(/Bio/)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/settings'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it("shows the API's 400 message, and a toast for anything else", async () => {
    let status = 400
    server.use(
      http.post(`${API}/profile/update`, () =>
        HttpResponse.json({ statusCode: status, message: 'Display name is too long', error: 'Bad Request' }, { status }),
      ),
    )
    const { user } = renderPage()
    await user.type(await screen.findByLabelText(/Bio/), 'x')

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Display name is too long')).toBeInTheDocument()

    status = 500
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await vi.waitFor(() =>
      expect(sileo.error).toHaveBeenCalledWith({ title: "Couldn't save your profile", description: 'Please try again.' }),
    )
  })
})
