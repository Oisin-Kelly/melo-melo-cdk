import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_IMAGE_BYTES } from '@/lib/dropbox'
import { CoverPicker } from './cover-picker'

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})

function setup(imageUrl: string | null = null) {
  const onChange = vi.fn()
  const onError = vi.fn()
  const { container } = render(<CoverPicker imageUrl={imageUrl} imageBgColor={null} onChange={onChange} onError={onError} />)
  const input = container.querySelector('input[type=file]') as HTMLInputElement
  return { onChange, onError, input, user: userEvent.setup({ applyAccept: false }) }
}

const image = (type = 'image/png', size = 10) => new File([new Uint8Array(size)], 'cover', { type })

describe('CoverPicker', () => {
  it('offers to add a cover when there is none', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Add cover' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })

  it('accepts a supported image and previews it', async () => {
    const { onChange, input, user } = setup()
    const file = image()

    await user.upload(input, file)

    expect(onChange).toHaveBeenCalledWith({ file, clear: false })
    expect(screen.getByRole('button', { name: 'Change cover' })).toBeInTheDocument()
  })

  it.each([
    ['an unsupported type', image('image/heic'), 'Choose a JPEG, PNG, WebP or GIF image.'],
    ['an image over 20 MB', image('image/jpeg', MAX_IMAGE_BYTES + 1), 'That image is over 20 MB. Choose a smaller one.'],
  ])('refuses %s before uploading anything', async (_, file, message) => {
    const { onChange, onError, input, user } = setup()

    await user.upload(input, file)

    expect(onError).toHaveBeenCalledWith(message)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('removing the saved cover clears it', async () => {
    const { onChange, user } = setup('https://cdn/cover.jpg')

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onChange).toHaveBeenLastCalledWith({ file: null, clear: true })
    expect(screen.getByRole('button', { name: 'Add cover' })).toBeInTheDocument()
  })

  it('removing a just-picked file goes back to the saved cover rather than clearing it', async () => {
    const { onChange, input, user } = setup('https://cdn/cover.jpg')
    await user.upload(input, image())

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onChange).toHaveBeenLastCalledWith({ file: null, clear: true })
  })

  it('with no saved cover, removing a picked file just undoes the pick', async () => {
    const { onChange, input, user } = setup(null)
    await user.upload(input, image())

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onChange).toHaveBeenLastCalledWith({ file: null, clear: false })
    expect(screen.getByRole('button', { name: 'Add cover' })).toBeInTheDocument()
  })
})
