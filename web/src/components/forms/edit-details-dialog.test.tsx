import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sileo } from 'sileo'
import { describe, expect, it, vi, type Mock } from 'vitest'
import { LIMITS } from '@/config/limits'
import { ApiError } from '@/lib/api-client'
import { renderWithProviders } from '@/testing/providers'
import { expectMessage, fieldErrors, fieldMessage } from '@/testing/messages'
import { EditDetailsDialog, type Details } from './edit-details-dialog'

type OnSave = (details: Details) => Promise<unknown>

function setup({
  url,
  genre,
  onSave = vi.fn<OnSave>(async () => {}),
}: { url?: { pathPrefix: string; slug: string }; genre?: string; onSave?: Mock<OnSave> } = {}) {
  const onOpenChange = vi.fn()
  renderWithProviders(
    <EditDetailsDialog
      isOpen
      onOpenChange={onOpenChange}
      title="Edit album"
      initial={{ name: 'Summer', description: 'Old notes', ...(genre !== undefined && { genre }) }}
      descriptionLimit={genre !== undefined ? LIMITS.trackDescription : undefined}
      cover={{ imageUrl: null, imageBgColor: null }}
      url={url}
      isSaving={false}
      onSave={onSave}
    />,
  )
  return { onSave, onOpenChange, user: userEvent.setup() }
}

const save = () => screen.getByRole('button', { name: 'Save' })

describe('EditDetailsDialog', () => {
  it('saves the edited details, says so and closes', async () => {
    const { onSave, onOpenChange, user } = setup()

    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Winter')
    await user.click(save())

    expect(onSave).toHaveBeenCalledWith({ name: 'Winter', description: 'Old notes', cover: { file: null, clear: false }, slug: undefined })
    // Saved + closed come after the awaited save
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(sileo.success).toHaveBeenCalledWith({ title: 'Saved', description: 'Winter' })
  })

  it('has nothing to save until something changes', async () => {
    const { user } = setup()
    expect(save()).toBeDisabled()

    await user.type(screen.getByLabelText(/Description/), '!')
    expect(save()).toBeEnabled()
  })

  it('saves with Enter in the name', async () => {
    const { onSave, user } = setup()

    await user.type(screen.getByLabelText('Name'), ' days{Enter}')

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Summer days' }))
  })

  it('shows a too-long description under the description (not the name), and blocks saving', async () => {
    const { onSave, user } = setup()

    await user.click(screen.getByLabelText(/Description/))
    await user.paste('x'.repeat(LIMITS.description + 1))

    expect(fieldMessage(/Description/)).toBe(`Keep it to ${LIMITS.description} characters.`)
    expect(fieldErrors()).toEqual([`Keep it to ${LIMITS.description} characters.`])
    expect(save()).toBeDisabled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('shows a too-long name under the name', async () => {
    const { user } = setup()

    await user.click(screen.getByLabelText('Name'))
    await user.paste('n'.repeat(LIMITS.name))

    expect(fieldMessage('Name')).toBe(`Keep it to ${LIMITS.name} characters.`)
    expect(fieldMessage(/Description/)).toBeNull()
    expect(save()).toBeDisabled()
  })

  it('says a name is needed as soon as it is empty, and blocks saving', async () => {
    const { user } = setup()

    await user.clear(screen.getByLabelText('Name'))

    expect(fieldMessage('Name')).toBe('Give it a name.')
    expect(save()).toBeDisabled()
  })

  // Cancelling the browser's file picker fires a bubbling `cancel` on the file input, which the
  // <dialog> took as a close request — so cancelling "Add cover" closed the whole dialog
  it('stays open when the cover file picker is cancelled', () => {
    const { onOpenChange } = setup()
    const fileInput = document.querySelector('input[type=file]')!

    fileInput.dispatchEvent(new Event('cancel', { bubbles: true }))

    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('has no URL field for items without a readable URL yet', () => {
    setup()
    expect(screen.queryByLabelText('URL')).not.toBeInTheDocument()
  })

  describe('URL field', () => {
    const url = { pathPrefix: '/me/albums/', slug: 'summer' }

    it('previews the full address and sends the URL only when it changed', async () => {
      const { onSave, user } = setup({ url })
      expect(screen.getByText(/\/me\/albums\/summer$/)).toBeInTheDocument()

      await user.type(screen.getByLabelText('Name'), '!')
      await user.click(save())
      expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ slug: undefined }))
    })

    it('tidies what you type into URL form and sends it', async () => {
      const { onSave, user } = setup({ url })

      await user.clear(screen.getByLabelText('URL'))
      await user.type(screen.getByLabelText('URL'), 'Summer Demos_2')
      await user.click(save())

      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ slug: 'summer-demos-2' }))
    })

    it('blocks saving a URL in the wrong shape, with the reason', async () => {
      const { onSave, user } = setup({ url })

      await user.clear(screen.getByLabelText('URL'))
      await user.type(screen.getByLabelText('URL'), 'summer!')

      expectMessage('Use lowercase letters, numbers and single dashes.')
      expect(save()).toBeDisabled()
      expect(onSave).not.toHaveBeenCalled()
    })

    it("shows the API's refusal (URL already used) above the form, not on a field", async () => {
      const onSave = vi.fn<OnSave>(async () => {
        throw new ApiError(400, 'That URL is already used. Try another.', null)
      })
      const { user } = setup({ url, onSave })

      await user.clear(screen.getByLabelText('URL'))
      await user.type(screen.getByLabelText('URL'), 'winter')
      await user.click(save())

      await vi.waitFor(() => expectMessage('That URL is already used. Try another.'))
      expect(fieldErrors()).toEqual([]) // a banner, not on the URL (or any) field
    })
  })

  it('shows other 400s above the form, and a message above the form for anything else too', async () => {
    const onSave = vi
      .fn<OnSave>()
      .mockRejectedValueOnce(new ApiError(400, 'That file is not an image.', null))
      .mockRejectedValueOnce(new Error('network'))
    const { user } = setup({ onSave })

    await user.type(screen.getByLabelText('Name'), '!')
    await user.click(save())
    expect(await screen.findByText('That file is not an image.')).toBeInTheDocument()

    await user.click(save())
    // In the dialog, not a toast (it would sit behind the open dialog)
    expect(await screen.findAllByText("Couldn't save your changes. Please try again.")).not.toHaveLength(0)
    expect(sileo.error).not.toHaveBeenCalled()
  })

  describe('Genre (tracks)', () => {
    it('only appears when the item has one to edit', () => {
      setup()
      expect(screen.queryByLabelText(/Genre/)).not.toBeInTheDocument()
    })

    it('is sent with the rest', async () => {
      const { onSave, user } = setup({ genre: 'Indie' })

      await user.type(screen.getByLabelText(/Genre/), ' pop')
      await user.click(save())

      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ genre: 'Indie pop' }))
    })

    it.each([
      [/Genre/, LIMITS.genre],
      [/Description/, LIMITS.trackDescription],
    ])('shows a too-long %s under that field only, and blocks saving', async (label, limit) => {
      const { user } = setup({ genre: '' })

      await user.click(screen.getByLabelText(label))
      await user.paste('x'.repeat(limit + 1))

      expect(fieldMessage(label)).toBe(`Keep it to ${limit} characters.`)
      expect(fieldErrors()).toEqual([`Keep it to ${limit} characters.`])
      expect(save()).toBeDisabled()
    })
  })
})
