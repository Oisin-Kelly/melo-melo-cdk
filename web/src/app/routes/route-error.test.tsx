import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouteError } from './route-error'

const reload = vi.fn()

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('location', { ...window.location, reload })
  sessionStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

function renderThrowing(error: unknown) {
  const router = createMemoryRouter([
    {
      path: '/',
      errorElement: <RouteError />,
      loader: () => {
        throw error
      },
      element: <p>never</p>,
    },
  ])
  return render(<RouterProvider router={router} />)
}

describe('RouteError', () => {
  it('shows a friendly error screen with Reload and Go home for ordinary errors', async () => {
    renderThrowing(new Error('kaboom'))

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
  })

  it.each([
    'Failed to fetch dynamically imported module: /assets/page-abc.js',
    'Importing a module script failed.',
    'error loading dynamically imported module',
    'Outdated Optimize Dep',
  ])('reloads once by itself for a stale chunk (%s)', async (message) => {
    renderThrowing(new TypeError(message))

    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  })

  it("won't reload again within a minute, so a genuinely broken chunk can't loop", async () => {
    sessionStorage.setItem('melomelo.chunk-reload-at', String(Date.now() - 30_000))

    renderThrowing(new TypeError('Failed to fetch dynamically imported module'))

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
  })
})
