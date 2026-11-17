import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { sileo } from 'sileo'
import { Outlet } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { user } from '@/testing/fixtures'
import { LocationProbe, renderRoutes } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { UploadProvider } from './upload-dialog'
import { useUpload } from './upload-context'

vi.mock('@/hooks/use-is-mobile', () => ({ useIsMobile: vi.fn(() => false) }))

const S3 = 'https://dropbox.s3.test/upload'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PUT',
  'Access-Control-Allow-Headers': 'Content-Type',
}
const audio = new File([new Uint8Array(2048)], 'late_shift.wav', { type: 'audio/wav' })

let posted: Record<string, unknown> | null
let statuses: string[]

beforeEach(() => {
  posted = null
  statuses = ['PROCESSING', 'COMPLETE']
  server.use(
    http.get(`${API}/users/me`, () => HttpResponse.json(user('me', { displayName: 'Me' }))),
    http.get(`${API}/buckets/dropbox`, ({ request }) => {
      const key = new URL(request.url).searchParams.get('key')!
      return HttpResponse.json({ url: S3, key: `me/${key}` })
    }),
    // The upload is an XMLHttpRequest, so jsdom preflights it like a browser would (S3's CORS)
    http.options(S3, () => new HttpResponse(null, { status: 204, headers: CORS })),
    http.put(S3, () => new HttpResponse(null, { status: 200, headers: CORS })),
    http.post(`${API}/tracks/upload`, async ({ request }) => {
      posted = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ trackId: 'new1', status: 'PROCESSING' }, { status: 202 })
    }),
    http.get(`${API}/tracks/uploads/new1`, () =>
      HttpResponse.json({ trackId: 'new1', status: statuses.shift() ?? 'COMPLETE', createdAt: 1 }),
    ),
  )
})

function OpenButton() {
  const { open } = useUpload()
  return <button onClick={open}>Open upload</button>
}

// The app's layout with the upload dialog in it, opened from Home
async function renderUpload() {
  const result = renderRoutes(
    [
      {
        element: (
          <UploadProvider>
            <Outlet />
          </UploadProvider>
        ),
        children: [
          { path: '/', element: <OpenButton /> },
          { path: '/tracks/:id', element: <LocationProbe /> },
          { path: '/:username', element: <LocationProbe /> },
        ],
      },
    ],
    { initialEntries: ['/'] },
  )
  await userEvent.click(screen.getByRole('button', { name: 'Open upload' }))
  const input = () => document.querySelector<HTMLInputElement>('input[type="file"][accept^="audio"]')!
  return { ...result, input }
}

describe('Upload dialog', () => {
  it('opens on the Audio step, a drop zone, with the steps as its title', async () => {
    await renderUpload()
    expect(screen.getByRole('button', { name: /Drop an audio file here, or choose one/ })).toBeInTheDocument()
    expect(screen.getByText(/only you can hear it until you share it/i)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Upload steps' })).toHaveTextContent(/Audio.*Details.*Share/)
  })

  it('refuses a file that is not audio, staying on the drop stage', async () => {
    const { input } = await renderUpload()
    await userEvent.upload(input(), new File(['x'], 'photo.jpg', { type: 'image/jpeg' }), { applyAccept: false })
    expect(await screen.findAllByText(/doesn't look like an audio file/)).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: /Drop an audio file here, or choose one/ })).toBeInTheDocument()
  })

  it('picking a file names the track after it, uploads it, and lands on the new track once it is ready', async () => {
    const { input, router } = await renderUpload()
    await userEvent.upload(input(), audio)

    // On to Details while it goes up: named after the file, the preview following
    expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue('late shift')
    expect(screen.getByRole('complementary', { name: 'Preview' })).toHaveTextContent('late shift')
    await screen.findByText('Uploaded')

    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByRole('heading', { name: 'Share it' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Upload' }))

    await waitFor(() => expect(posted).not.toBeNull())
    expect(posted).toMatchObject({ name: 'late shift', sharedWith: [], caption: null })
    expect(String(posted!.audioKey)).toMatch(/^me\/audio\/.+\.wav$/)
    expect(await screen.findByText('Getting it ready…')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/tracks/new1'), { timeout: 5000 })
    expect(sileo.success).toHaveBeenCalledWith({ title: 'Uploaded', description: 'late shift' })
  })

  it('Back and the stepper return to earlier steps, keeping what was filled in', async () => {
    const { input } = await renderUpload()
    await userEvent.upload(input(), audio)
    await userEvent.click(await screen.findByRole('button', { name: /^Genre/ }))
    await userEvent.click(await screen.findByRole('option', { name: 'Electronic' }))
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('button', { name: /^Genre/ })).toHaveTextContent('Electronic')
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    // The file's still picked: Next goes straight on
    expect(screen.getByRole('button', { name: /Choose a different file/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue('late shift')
  })

  it("cancelling the browser's file picker leaves the dialog open", async () => {
    const { input } = await renderUpload()
    // The picker's `cancel` bubbles, and a <dialog> takes `cancel` as Escape
    input().dispatchEvent(new Event('cancel', { bubbles: true }))
    expect(screen.getByRole('dialog', { name: 'Upload a track' })).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('closing before uploading asks first, and discarding starts afresh', async () => {
    const { input } = await renderUpload()
    await userEvent.upload(input(), audio)
    await screen.findByRole('textbox', { name: 'Name' })
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }))
    await userEvent.click(screen.getByRole('button', { name: 'Open upload' }))
    expect(await screen.findByRole('button', { name: /Drop an audio file here, or choose one/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Choose a different file/ })).not.toBeInTheDocument()
  })

  it('says why processing failed, and Try another file goes back keeping the details', async () => {
    statuses = ['FAILED']
    const dismissed = vi.fn()
    server.use(
      http.get(`${API}/tracks/uploads/new1`, () =>
        HttpResponse.json({ trackId: 'new1', status: 'FAILED', error: 'That file is longer than 24 hours.', createdAt: 1 }),
      ),
      http.delete(`${API}/tracks/uploads/new1`, () => {
        dismissed()
        return HttpResponse.json({})
      }),
    )
    const { input } = await renderUpload()
    await userEvent.upload(input(), audio)
    await screen.findByText('Uploaded')
    await userEvent.clear(screen.getByRole('textbox', { name: 'Name' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Keep me')
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Upload' }))

    expect(await screen.findByText('That file is longer than 24 hours.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try another file' }))
    expect(screen.getByRole('button', { name: /Drop an audio file here, or choose one/ })).toBeInTheDocument()
    // The failed attempt leaves Your tracks
    await vi.waitFor(() => expect(dismissed).toHaveBeenCalledOnce())

    await userEvent.upload(input(), audio)
    expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue('Keep me')
  })
})
