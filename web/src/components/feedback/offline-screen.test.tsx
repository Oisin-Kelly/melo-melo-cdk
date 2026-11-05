import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { sileo } from 'sileo'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OnlineGate } from './offline-screen'

afterEach(() => vi.unstubAllGlobals())

function setOnline(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)
  act(() => window.dispatchEvent(new Event(value ? 'online' : 'offline')))
}

describe('OnlineGate', () => {
  it('shows the app while online, and the offline screen in its place when the connection drops', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    render(
      <OnlineGate>
        <p>The app</p>
      </OnlineGate>,
    )
    expect(screen.getByText('The app')).toBeInTheDocument()

    setOnline(false)
    expect(screen.getByText("It looks like you're offline")).toBeInTheDocument()
    expect(screen.queryByText('The app')).not.toBeInTheDocument()

    setOnline(true)
    expect(screen.getByText('The app')).toBeInTheDocument()
  })

  it('"Try again" while still offline just says so (a reload would show the browser\'s error page)', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<OnlineGate>app</OnlineGate>)

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(reload).not.toHaveBeenCalled()
    expect(sileo.info).toHaveBeenCalledWith(expect.objectContaining({ title: 'Still offline' }))
  })
})
