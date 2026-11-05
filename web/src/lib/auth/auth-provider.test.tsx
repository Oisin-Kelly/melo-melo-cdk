import { QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { act, render, screen, waitFor } from '@testing-library/react'
import * as amplifyAuth from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'
import { http, HttpResponse } from 'msw'
import { useEffect } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, setAuthTokenProvider, setUnauthorizedHandler } from '@/lib/api-client'
import { RequireAuth } from '@/app/layouts/guards'
import { useSignOut } from '@/features/users/hooks/use-sign-out'
import { createTestQueryClient, LocationProbe } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { useAuth } from './auth-context'
import { AuthProvider } from './auth-provider'

vi.mock('./amplify', () => ({ configureAmplify: vi.fn() }))
vi.mock('aws-amplify/auth', () => ({ fetchAuthSession: vi.fn(), signOut: vi.fn() }))
vi.mock('aws-amplify/utils', () => ({ Hub: { listen: vi.fn() } }))

const mocked = vi.mocked(amplifyAuth)
type HubCallback = (data: { payload: { event: string } }) => void
let hubCallback: HubCallback
let unsubscribe: ReturnType<typeof vi.fn>

function session(username: string, token = 'id-token') {
  return { tokens: { idToken: { payload: { 'cognito:username': username }, toString: () => token } } }
}

function Probe() {
  const { status, username } = useAuth()
  return <output data-testid="auth">{`${status}:${username ?? '-'}`}</output>
}

function renderProvider() {
  const queryClient = createTestQueryClient()
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return { ...utils, queryClient }
}

const authText = () => screen.getByTestId('auth').textContent

beforeEach(() => {
  vi.resetAllMocks()
  unsubscribe = vi.fn()
  vi.mocked(Hub.listen).mockImplementation(((_channel: string, callback: HubCallback) => {
    hubCallback = callback
    return unsubscribe
  }) as never)
  mocked.signOut.mockResolvedValue(undefined)
})

afterEach(() => {
  setAuthTokenProvider(async () => null)
  setUnauthorizedHandler(() => {})
})

describe('AuthProvider', () => {
  it('starts loading, then is signed in as the lowercased Cognito username', async () => {
    mocked.fetchAuthSession.mockResolvedValue(session('OisinKelly') as never)

    renderProvider()

    expect(authText()).toBe('loading:-')
    await waitFor(() => expect(authText()).toBe('signedIn:oisinkelly'))
  })

  it.each([
    ['no tokens', async () => ({ tokens: undefined })],
    ['no username claim', async () => ({ tokens: { idToken: { payload: {}, toString: () => 't' } } })],
    [
      'the session lookup throws',
      async () => {
        throw new Error('offline')
      },
    ],
  ])('is signed out when there is %s', async (_, impl) => {
    mocked.fetchAuthSession.mockImplementation(impl as never)

    renderProvider()

    await waitFor(() => expect(authText()).toBe('signedOut:-'))
  })

  it('gives the API client the current ID token', async () => {
    mocked.fetchAuthSession.mockResolvedValue(session('me', 'fresh-token') as never)
    let auth: string | null = null
    server.use(
      http.get(`${API}/whoami`, ({ request }) => {
        auth = request.headers.get('Authorization')
        return HttpResponse.json({})
      }),
    )
    renderProvider()
    await waitFor(() => expect(authText()).toBe('signedIn:me'))

    await api('/whoami')

    expect(auth).toBe('Bearer fresh-token')
  })

  it('signs out and empties the cache when the API answers 401', async () => {
    mocked.fetchAuthSession.mockResolvedValue(session('me') as never)
    server.use(http.get(`${API}/gone`, () => HttpResponse.json({}, { status: 401 })))
    const { queryClient } = renderProvider()
    await waitFor(() => expect(authText()).toBe('signedIn:me'))
    queryClient.setQueryData(['users', 'me'], { secret: true })

    await act(() => api('/gone').catch(() => {}))

    await waitFor(() => expect(authText()).toBe('signedOut:-'))
    expect(mocked.signOut).toHaveBeenCalled()
    expect(queryClient.getQueryData(['users', 'me'])).toBeUndefined()
  })

  it('signOut() clears everything even if Amplify fails', async () => {
    mocked.fetchAuthSession.mockResolvedValue(session('me') as never)
    mocked.signOut.mockRejectedValue(new Error('network'))
    let signOut!: () => Promise<void>
    function Grab() {
      const auth = useAuth()
      useEffect(() => {
        signOut = auth.signOut
      })
      return null
    }
    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Probe />
          <Grab />
        </AuthProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(authText()).toBe('signedIn:me'))
    queryClient.setQueryData(['feed'], [1])

    await act(() => signOut().catch(() => {}))

    expect(authText()).toBe('signedOut:-')
    expect(queryClient.getQueryData(['feed'])).toBeUndefined()
  })

  it("follows Amplify's auth events", async () => {
    mocked.fetchAuthSession.mockResolvedValue({ tokens: undefined } as never)
    const { queryClient } = renderProvider()
    await waitFor(() => expect(authText()).toBe('signedOut:-'))

    // Signed in elsewhere in the app (e.g. the sign-in form)
    mocked.fetchAuthSession.mockResolvedValue(session('me') as never)
    act(() => hubCallback({ payload: { event: 'signedIn' } }))
    await waitFor(() => expect(authText()).toBe('signedIn:me'))

    // The refresh token died
    queryClient.setQueryData(['feed'], [1])
    act(() => hubCallback({ payload: { event: 'tokenRefresh_failure' } }))
    expect(authText()).toBe('signedOut:-')
    expect(queryClient.getQueryData(['feed'])).toBeUndefined()
  })

  it('stops listening when unmounted', async () => {
    mocked.fetchAuthSession.mockResolvedValue({ tokens: undefined } as never)
    const { unmount } = renderProvider()
    await waitFor(() => expect(authText()).toBe('signedOut:-'))

    unmount()

    expect(unsubscribe).toHaveBeenCalled()
  })

  // The reported bug: signing out from a protected page landed on /login?next=<that page>,
  // because the page's guard redirected before the sign-out could go home
  describe('where you end up when the session ends', () => {
    function SignOutButton() {
      const signOut = useSignOut()
      return <button onClick={() => void signOut()}>Sign out</button>
    }

    function renderApp() {
      return render(
        <QueryClientProvider client={createTestQueryClient()}>
          <AuthProvider>
            <MemoryRouter initialEntries={['/settings']}>
              <Routes>
                <Route path="/login" element={<LocationProbe />} />
                <Route
                  path="*"
                  element={
                    <RequireAuth signedOutHome={<LocationProbe />}>
                      <SignOutButton />
                      <LocationProbe />
                    </RequireAuth>
                  }
                />
              </Routes>
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      )
    }

    it('signing out goes home, with no ?next= back to the page you left', async () => {
      mocked.fetchAuthSession.mockResolvedValue(session('me') as never)
      renderApp()
      await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))

      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/))
    })

    it('an expired session (401) still goes to sign-in and back again', async () => {
      mocked.fetchAuthSession.mockResolvedValue(session('me') as never)
      server.use(http.get(`${API}/gone`, () => HttpResponse.json({}, { status: 401 })))
      renderApp()
      await screen.findByRole('button', { name: 'Sign out' })

      await act(() => api('/gone').catch(() => {}))

      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login?next=%2Fsettings'))
    })

    it('signing in again clears it, so a later expiry keeps ?next= again', async () => {
      mocked.fetchAuthSession.mockResolvedValue(session('me') as never)
      let state!: ReturnType<typeof useAuth>
      function Grab() {
        const auth = useAuth()
        useEffect(() => {
          state = auth
        })
        return null
      }
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <AuthProvider>
            <Grab />
          </AuthProvider>
        </QueryClientProvider>,
      )
      await waitFor(() => expect(state.status).toBe('signedIn'))

      await act(() => state.signOut())
      expect(state.didSignOut).toBe(true)

      act(() => hubCallback({ payload: { event: 'signedIn' } }))
      await waitFor(() => expect(state.status).toBe('signedIn'))
      expect(state.didSignOut).toBe(false)
    })
  })
})
