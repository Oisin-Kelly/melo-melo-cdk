import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { GenreField } from './genre-field'

function Harness({ initial = '' }: { initial?: string }) {
  const [genre, setGenre] = useState(initial)
  return (
    <>
      <GenreField value={genre} onChange={setGenre} error={null} />
      <output aria-label="saved">{genre}</output>
    </>
  )
}

const saved = () => screen.getByLabelText('saved').textContent
const picker = () => screen.getByRole('button', { name: /^Genre/ })

async function pick(user: ReturnType<typeof userEvent.setup>, option: string) {
  await user.click(picker())
  await user.click(await screen.findByRole('option', { name: option }))
}

describe('GenreField', () => {
  it('picks a genre from the list', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await pick(user, 'Drum & Bass')

    expect(saved()).toBe('Drum & Bass')
    expect(picker()).toHaveTextContent('Drum & Bass')
    expect(screen.queryByRole('textbox', { name: /Your genre/ })).not.toBeInTheDocument()
  })

  it('Other… opens a field to type your own', async () => {
    const user = userEvent.setup()
    render(<Harness initial="Rock" />)

    await pick(user, 'Other…')
    expect(saved()).toBe('') // the listed one goes; you type the new one
    await user.type(screen.getByRole('textbox', { name: /Your genre/ }), 'Shoegaze')

    expect(saved()).toBe('Shoegaze')
  })

  it('opens a saved genre on the list as picked, and one off it as Other with its text', () => {
    const { unmount } = render(<Harness initial="indie" />)
    expect(picker()).toHaveTextContent('Indie')
    expect(screen.queryByRole('textbox', { name: /Your genre/ })).not.toBeInTheDocument()
    unmount()

    render(<Harness initial="Shoegaze" />)
    expect(picker()).toHaveTextContent('Other…')
    expect(screen.getByRole('textbox', { name: /Your genre/ })).toHaveValue('Shoegaze')
  })

  it('back to a listed genre from Other replaces what was typed', async () => {
    const user = userEvent.setup()
    render(<Harness initial="Shoegaze" />)

    await pick(user, 'Pop')

    expect(saved()).toBe('Pop')
    expect(screen.queryByRole('textbox', { name: /Your genre/ })).not.toBeInTheDocument()
  })
})
