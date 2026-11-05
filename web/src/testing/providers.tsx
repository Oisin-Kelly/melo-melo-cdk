import { LinkProvider } from '@astryxdesign/core/Link'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook, type RenderHookOptions, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { createMemoryRouter, MemoryRouter, RouterProvider, useLocation, type RouteObject } from 'react-router'
import { vi } from 'vitest'
import { RouterAnchor } from '@/app/layouts/root-layout'
import { AuthContext, type AuthStatus } from '@/lib/auth/auth-context'

/** A fresh client per test: no retries and no retry delay (hooks with their own `retry`
 *  functions still use the default delay), nothing cached between tests. */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0, gcTime: Infinity },
      mutations: { retry: false, retryDelay: 0 },
    },
  })
}

export type ProviderOptions = {
  queryClient?: QueryClient
  /** Signed in as this user (lowercase); null → signed out. Default 'me'. */
  username?: string | null
  status?: AuthStatus
  signOut?: () => Promise<void>
  /** The session ended because the user signed out (RequireAuth then goes home). Default false. */
  didSignOut?: boolean
  /** MemoryRouter's starting entries. Default ['/']. */
  route?: string | string[]
}

export function createWrapper(options: ProviderOptions = {}) {
  const queryClient = options.queryClient ?? createTestQueryClient()
  const username = options.username === undefined ? 'me' : options.username
  const auth = {
    status: options.status ?? (username ? 'signedIn' : 'signedOut'),
    username,
    didSignOut: options.didSignOut ?? false,
    signOut: options.signOut ?? vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
  } as const
  const entries = typeof options.route === 'string' ? [options.route] : (options.route ?? ['/'])

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={auth}>
          <MemoryRouter initialEntries={entries}>
            {/* As in the app (RootLayout): Astryx links navigate through the router */}
            <LinkProvider component={RouterAnchor}>{children}</LinkProvider>
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    )
  }
  return { Wrapper, queryClient, auth }
}

/** renderHook inside the app's providers; returns the query client for cache assertions. */
export function renderHookWithProviders<Result, Props>(
  hook: (props: Props) => Result,
  options: ProviderOptions & Omit<RenderHookOptions<Props>, 'wrapper'> = {},
) {
  const { Wrapper, queryClient, auth } = createWrapper(options)
  return { ...renderHook(hook, { ...options, wrapper: Wrapper }), queryClient, auth }
}

export function renderWithProviders(ui: ReactElement, options: ProviderOptions & Omit<RenderOptions, 'wrapper'> = {}) {
  const { Wrapper, queryClient, auth } = createWrapper(options)
  return { ...render(ui, { ...options, wrapper: Wrapper }), queryClient, auth }
}

/** Renders the current location as text, for asserting redirects and replaced URLs. */
export function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>
}

/** A data router (needed by useBlocker and route errorElements) inside the app's providers. */
export function renderRoutes(routes: RouteObject[], options: Omit<ProviderOptions, 'route'> & { initialEntries?: string[]; initialIndex?: number } = {}) {
  const queryClient = options.queryClient ?? createTestQueryClient()
  const username = options.username === undefined ? 'me' : options.username
  const auth = {
    status: options.status ?? (username ? 'signedIn' : 'signedOut'),
    username,
    didSignOut: options.didSignOut ?? false,
    signOut: options.signOut ?? vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
  } as const
  const router = createMemoryRouter(routes, { initialEntries: options.initialEntries ?? ['/'], initialIndex: options.initialIndex })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <LinkProvider component={RouterAnchor}>
          <RouterProvider router={router} />
        </LinkProvider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
  return { ...result, router, queryClient, auth }
}
