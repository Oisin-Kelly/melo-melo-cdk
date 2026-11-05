import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './error-boundary'
import { MainErrorFallback } from './main-error-fallback'

function Boom(): never {
  throw new Error('render failed')
}

describe('ErrorBoundary', () => {
  it('renders its children when nothing goes wrong', () => {
    render(<ErrorBoundary fallback={<p>fallback</p>}><p>fine</p></ErrorBoundary>)
    expect(screen.getByText('fine')).toBeInTheDocument()
  })

  it('shows the fallback (and logs) when anything below it throws while rendering', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary fallback={<MainErrorFallback />}><Boom /></ErrorBoundary>)

    expect(screen.getByRole('button', { name: /Reload|Refresh|Try again/i })).toBeInTheDocument()
    expect(log).toHaveBeenCalledWith('Uncaught render error:', expect.any(Error), expect.anything())
  })
})
