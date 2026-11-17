import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { sileo } from 'sileo'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlbumEditor } from '@/components/albums/album-editor-context'
import { albumSummary, trackSummary } from '@/testing/fixtures'
import { LocationProbe, renderRoutes } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { captureBodies } from '@/testing/stage-upload'
import { AlbumEditorProvider } from './album-editor'

vi.mock('@/hooks/use-is-mobile', () => ({ useIsMobile: vi.fn(() => false) }))

const uploads = [
  trackSummary('t1', { name: 'Opener' }),
  trackSummary('t2', { name: 'Middle' }),
  trackSummary('t3', { name: 'Closer' }),
]
const created = { ...albumSummary('a9', { name: 'Summer', slug: 'summer' }), description: null }

function Openers({ shareCount = 0 }: { shareCount?: number }) {
  const editor = useAlbumEditor()
  return (
    <>
      <button onClick={() => editor.create()}>new</button>
      <button onClick={() => editor.create(uploads.slice(1))}>new from selection</button>
      <button onClick={() => editor.editTracks({ id: 'a1', name: 'Summer', shareCount }, async () => uploads.slice(0, 2))}>
        edit
      </button>
    </>
  )
}

function renderEditor(shareCount?: number) {
  const result = renderRoutes([
    {
      path: '/',
      element: (
        <AlbumEditorProvider>
          <Openers shareCount={shareCount} />
        </AlbumEditorProvider>
      ),
    },
    { path: '*', element: <LocationProbe /> },
  ])
  return { ...result, user: userEvent.setup() }
}

const names = (dialog: HTMLElement) => within(dialog).getAllByRole('listitem').map((row) => row.textContent?.replace(/^\d+|\d+:\d+$/g, ''))

beforeEach(() => {
  server.use(http.get(`${API}/tracks`, () => HttpResponse.json({ items: uploads, nextCursor: null })))
})

describe('New album', () => {
  it('creates it from the tracks picked, in the order they were ticked, and opens it', async () => {
    const bodies = captureBodies('post', '/albums', created)
    const { user, router } = renderEditor()
    await user.click(screen.getByRole('button', { name: 'new' }))
    const dialog = await screen.findByRole('dialog', { name: 'New album' })

    await user.type(within(dialog).getByLabelText('Name'), ' Summer ')
    await user.click(within(dialog).getByRole('button', { name: 'Add tracks' }))
    await user.click(await within(dialog).findByRole('checkbox', { name: 'Closer' }))
    await user.click(within(dialog).getByRole('checkbox', { name: 'Opener' }))
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(names(dialog)).toEqual(['Closer', 'Opener'])

    await user.click(within(dialog).getByRole('button', { name: 'Create album' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/me/albums/summer'))
    expect(bodies).toEqual([{ name: 'Summer', description: null, trackIds: ['t3', 't1'] }])
    expect(sileo.success).toHaveBeenCalledWith({ title: 'Album created', description: 'Summer' })
  })

  it('starts with the tracks it was opened with, and asks before dropping them', async () => {
    const bodies = captureBodies('post', '/albums', created)
    const { user } = renderEditor()
    await user.click(screen.getByRole('button', { name: 'new from selection' }))
    const dialog = await screen.findByRole('dialog', { name: 'New album' })
    expect(names(dialog)).toEqual(['Middle', 'Closer'])

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await user.click(await screen.findByRole('button', { name: 'Keep editing' }))

    await user.type(within(dialog).getByLabelText('Name'), 'Summer')
    await user.click(within(dialog).getByRole('button', { name: 'Create album' }))
    await vi.waitFor(() => expect(bodies).toEqual([{ name: 'Summer', description: null, trackIds: ['t2', 't3'] }]))
  })

  it('can be made empty, but not without a name', async () => {
    const bodies = captureBodies('post', '/albums', created)
    const { user } = renderEditor()
    await user.click(screen.getByRole('button', { name: 'new' }))
    const dialog = await screen.findByRole('dialog', { name: 'New album' })
    expect(within(dialog).getByRole('button', { name: 'Create album' })).toBeDisabled()

    await user.type(within(dialog).getByLabelText('Name'), 'Summer')
    await user.click(within(dialog).getByRole('button', { name: 'Create album' }))

    await vi.waitFor(() => expect(bodies).toEqual([{ name: 'Summer', description: null, trackIds: [] }]))
  })

  it('searches the picker, and Back leaves the tracklist as it was', async () => {
    const { user } = renderEditor()
    await user.click(screen.getByRole('button', { name: 'new' }))
    const dialog = await screen.findByRole('dialog', { name: 'New album' })
    await user.click(within(dialog).getByRole('button', { name: 'Add tracks' }))

    await user.type(await within(dialog).findByLabelText('Search your tracks'), 'clo')
    expect(within(dialog).getAllByRole('checkbox').map((box) => box.getAttribute('aria-label') ?? (box as HTMLInputElement).labels?.[0]?.textContent)).toEqual(['Closer'])
    await user.click(within(dialog).getByRole('checkbox', { name: 'Closer' }))
    await user.click(within(dialog).getByRole('button', { name: 'Back' }))

    expect(within(dialog).getByText('No tracks yet')).toBeInTheDocument()
  })

  it('asks before discarding, and shows the API’s own message for a 400', async () => {
    server.use(http.post(`${API}/albums`, () => HttpResponse.json({ statusCode: 400, message: 'name is taken', error: 'Bad Request' }, { status: 400 })))
    const { user } = renderEditor()
    await user.click(screen.getByRole('button', { name: 'new' }))
    const dialog = await screen.findByRole('dialog', { name: 'New album' })
    await user.type(within(dialog).getByLabelText('Name'), 'Summer')

    await user.click(within(dialog).getByRole('button', { name: 'Create album' }))
    expect(await within(dialog).findByText('name is taken')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Discard this album?' })).getByRole('button', { name: 'Discard' }))
    await vi.waitFor(() => expect(screen.queryByLabelText('Name')).not.toBeInTheDocument())
  })
})

describe('Edit tracks', () => {
  it('starts from the album, reorders by the arrow keys on a handle, removes, adds, and saves the list', async () => {
    const bodies = captureBodies('put', '/albums/a1/tracks', { trackCount: 2, added: 1, removed: 1 })
    const { user } = renderEditor()
    await user.click(screen.getByRole('button', { name: 'edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit tracks' })
    await within(dialog).findByText('Opener')
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()

    within(dialog).getByRole('button', { name: /Move Opener/ }).focus()
    await user.keyboard('{ArrowDown}')
    expect(names(dialog)).toEqual(['Middle', 'Opener'])

    await user.click(within(dialog).getByRole('button', { name: 'Remove Middle' }))
    await user.click(within(dialog).getByRole('button', { name: 'Add tracks' }))
    expect(await within(dialog).findByRole('checkbox', { name: 'Opener' })).toBeChecked()
    await user.click(within(dialog).getByRole('checkbox', { name: 'Closer' }))
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await vi.waitFor(() => expect(bodies).toEqual([{ trackIds: ['t1', 't3'] }]))
    await vi.waitFor(() => expect(sileo.success).toHaveBeenCalledWith({ title: 'Saved', description: 'Summer' }))
  })

  it('says who a change reaches when the album is shared', async () => {
    const { user } = renderEditor(3)
    await user.click(screen.getByRole('button', { name: 'edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit tracks' })
    expect(await within(dialog).findByText('Shared with 3 people')).toBeInTheDocument()
  })
})
