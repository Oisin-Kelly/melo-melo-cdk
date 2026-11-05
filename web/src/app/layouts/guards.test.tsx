import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { AuthStatus } from '@/lib/auth/auth-context'
import { LocationProbe, renderWithProviders } from '@/testing/providers'
import { GuestOnly, RequireAuth } from './guards'

function renderApp(status: AuthStatus, route: string) {
  renderWithProviders(
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<p>Login screen</p>} />
      </Route>
      <Route
        path="*"
        element={
          <RequireAuth signedOutHome={<p>Landing page</p>}>
            <p>The app</p>
          </RequireAuth>
        }
      />
    </Routes>,
    { status, username: status === 'signedIn' ? 'me' : null, route },
  )
}

describe('RequireAuth', () => {
  it('shows a spinner while the session loads', () => {
    renderApp('loading', '/library')
    expect(screen.queryByText('The app')).not.toBeInTheDocument()
    expect(screen.queryByText('Login screen')).not.toBeInTheDocument()
  })

  it('lets a signed-in user in', () => {
    renderApp('signedIn', '/library')
    expect(screen.getByText('The app')).toBeInTheDocument()
  })

  it('shows the landing page at / when signed out', () => {
    renderApp('signedOut', '/')
    expect(screen.getByText('Landing page')).toBeInTheDocument()
  })

  it('sends any other signed-out visit to sign-in, remembering where it was going', () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LocationProbe />} />
        <Route
          path="*"
          element={
            <RequireAuth signedOutHome={null}>
              <p>The app</p>
            </RequireAuth>
          }
        />
      </Routes>,
      { status: 'signedOut', username: null, route: '/oisin/my-song?play=1' },
    )
    expect(screen.getByTestId('location')).toHaveTextContent('/login?next=%2Foisin%2Fmy-song%3Fplay%3D1')
  })

  it('after signing out on purpose, goes home rather than to sign-in with ?next=', () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LocationProbe />} />
        <Route path="/" element={<LocationProbe />} />
        <Route
          path="*"
          element={
            <RequireAuth signedOutHome={null}>
              <p>The app</p>
            </RequireAuth>
          }
        />
      </Routes>,
      { status: 'signedOut', username: null, didSignOut: true, route: '/settings' },
    )
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
  })
})

describe('GuestOnly', () => {
  it('shows the auth screen when signed out', () => {
    renderApp('signedOut', '/login')
    expect(screen.getByText('Login screen')).toBeInTheDocument()
  })

  function signedInAt(route: string) {
    const { unmount } = renderWithProviders(
      <Routes>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<p>Login screen</p>} />
        </Route>
        <Route path="*" element={<LocationProbe />} />
      </Routes>,
      { status: 'signedIn', route },
    )
    const location = screen.getByTestId('location').textContent
    unmount()
    return location
  }

  it('sends a signed-in user on to ?next=', () => {
    expect(signedInAt('/login?next=%2Fliked')).toBe('/liked')
  })

  it("won't follow ?next= off the site", () => {
    expect(signedInAt('/login?next=%2F%2Fevil.example')).toBe('/')
    expect(signedInAt('/login')).toBe('/')
  })
})
