import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DisplayPrefsProvider } from './display-prefs'
import { useDisplayPrefs } from './use-display-prefs'

function Probe() {
  const { textSize, density, setTextSize, setDensity } = useDisplayPrefs()
  return (
    <>
      <p>{`${textSize} ${density}`}</p>
      <button onClick={() => setTextSize('large')}>Large</button>
      <button onClick={() => setTextSize('default')}>Default size</button>
      <button onClick={() => setDensity('compact')}>Compact</button>
    </>
  )
}
const root = document.documentElement

beforeEach(() => localStorage.clear())
afterEach(() => {
  delete root.dataset.mmTextSize
  delete root.dataset.mmDensity
})

describe('DisplayPrefsProvider', () => {
  it('starts at the defaults, with nothing on <html>', () => {
    render(<DisplayPrefsProvider><Probe /></DisplayPrefsProvider>)
    expect(screen.getByText('default comfortable')).toBeInTheDocument()
    expect(root.dataset.mmTextSize).toBeUndefined()
    expect(root.dataset.mmDensity).toBeUndefined()
  })

  it('applies a choice to <html> and remembers it on this device', async () => {
    const user = userEvent.setup()
    render(<DisplayPrefsProvider><Probe /></DisplayPrefsProvider>)

    await user.click(screen.getByRole('button', { name: 'Large' }))
    await user.click(screen.getByRole('button', { name: 'Compact' }))

    expect(root.dataset.mmTextSize).toBe('large')
    expect(root.dataset.mmDensity).toBe('compact')
    expect(localStorage.getItem('melomelo.text-size')).toBe('large')
    expect(localStorage.getItem('melomelo.density')).toBe('compact')
  })

  it('reads the saved choice back, and going back to a default clears it', async () => {
    localStorage.setItem('melomelo.text-size', 'xlarge')
    render(<DisplayPrefsProvider><Probe /></DisplayPrefsProvider>)
    expect(screen.getByText('xlarge comfortable')).toBeInTheDocument()
    expect(root.dataset.mmTextSize).toBe('xlarge')

    await userEvent.setup().click(screen.getByRole('button', { name: 'Default size' }))

    expect(localStorage.getItem('melomelo.text-size')).toBeNull()
    expect(root.dataset.mmTextSize).toBeUndefined()
  })

  it('ignores a value it does not know', () => {
    localStorage.setItem('melomelo.density', 'tiny')
    render(<DisplayPrefsProvider><Probe /></DisplayPrefsProvider>)
    expect(screen.getByText('default comfortable')).toBeInTheDocument()
  })

  it('reads as the defaults outside the provider', () => {
    render(<Probe />)
    expect(screen.getByText('default comfortable')).toBeInTheDocument()
  })
})
