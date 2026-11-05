import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router'
import { sileo } from 'sileo'
import { describe, expect, it, vi } from 'vitest'
import { LIMITS } from '@/config/limits'
import { LocationProbe, renderWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { expectMessage } from '@/testing/messages'
import { CreatePlaylistDialog } from './create-playlist-dialog'

function setup() {
  const onOpenChange = vi.fn()
  renderWithProviders(
    <Routes>
      <Route path="/library" element={<CreatePlaylistDialog isOpen onOpenChange={onOpenChange} />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { route: '/library', username: 'me' },
  )
  return { onOpenChange, user: userEvent.setup() }
}

describe('CreatePlaylistDialog', () => {
  it('creates the playlist and opens it at its readable URL', async () => {
    let body: unknown
    server.use(
      http.post(`${API}/playlists`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ id: 'p1', name: 'Late night', slug: 'late-night', type: 'CUSTOM' })
      }),
    )
    const { onOpenChange, user } = setup()

    await user.type(screen.getByLabelText('Name'), '  Late night {Enter}')

    expect(await screen.findByTestId('location')).toHaveTextContent('/me/playlists/late-night')
    expect(body).toEqual({ name: 'Late night' })
    expect(sileo.success).toHaveBeenCalledWith({ title: 'Playlist created', description: 'Late night' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('needs a name, and keeps to the limit', async () => {
    const { user } = setup()

    await user.click(screen.getByRole('button', { name: 'Create' }))
    expectMessage('Give your playlist a name.')

    await user.type(screen.getByLabelText('Name'), 'x'.repeat(LIMITS.name + 1))
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expectMessage(`Keep it to ${LIMITS.name} characters.`)
  })

  it("shows the API's 400 message, and a message in the dialog for anything else", async () => {
    let status = 400
    server.use(
      http.post(`${API}/playlists`, () =>
        HttpResponse.json({ statusCode: status, message: 'That name has odd characters.', error: 'Bad Request' }, { status }),
      ),
    )
    const { user } = setup()
    await user.type(screen.getByLabelText('Name'), 'Mix{Enter}')
    expect(await screen.findAllByText('That name has odd characters.')).not.toHaveLength(0)

    status = 500
    await user.click(screen.getByRole('button', { name: 'Create' }))
    // In the dialog, not a toast (it would sit behind the open dialog)
    expect(await screen.findAllByText("Couldn't create the playlist. Please try again.")).not.toHaveLength(0)
    expect(sileo.error).not.toHaveBeenCalled()
  })

  it('Cancel closes without creating anything', async () => {
    const { onOpenChange, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
