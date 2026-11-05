import { useQueryClient } from '@tanstack/react-query'
import { fetchAuthSession, signOut as amplifySignOut } from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { setAuthTokenProvider, setUnauthorizedHandler } from '@/lib/api-client'
import { configureAmplify } from './amplify'
import { AuthContext, type AuthStatus } from './auth-context'

configureAmplify()

// The ID token is what the HTTP API's Cognito authorizer reads (cognito:username).
// fetchAuthSession() refreshes it transparently once it expires.
async function currentSession(): Promise<{ token: string; username: string } | null> {
  try {
    const { tokens } = await fetchAuthSession()
    const idToken = tokens?.idToken
    const username = idToken?.payload['cognito:username']
    if (!idToken || typeof username !== 'string') return null
    return { token: idToken.toString(), username: username.toLowerCase() }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [username, setUsername] = useState<string | null>(null)
  const [didSignOut, setDidSignOut] = useState(false)

  const refresh = useCallback(async () => {
    const session = await currentSession()
    setUsername(session?.username ?? null)
    setStatus(session ? 'signedIn' : 'signedOut')
    if (session) setDidSignOut(false)
  }, [])

  const signOut = useCallback(async () => {
    setDidSignOut(true)
    try {
      await amplifySignOut()
    } finally {
      queryClient.clear() // nothing cached for one account may leak into the next
      setUsername(null)
      setStatus('signedOut')
    }
  }, [queryClient])

  // The session ended on its own (401): same cleanup, but not the user's choice
  const endSession = useCallback(async () => {
    try {
      await amplifySignOut()
    } finally {
      queryClient.clear()
      setUsername(null)
      setStatus('signedOut')
    }
  }, [queryClient])

  useEffect(() => {
    setAuthTokenProvider(async () => (await currentSession())?.token ?? null)
    // A 401 means the session is gone server-side (expired refresh token, revoked) — not the
    // user's choice, so they're sent to sign in and back (didSignOut stays false)
    setUnauthorizedHandler(() => void endSession())
    // refresh() awaits the session before setting state, so this isn't a synchronous update
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh()

    return Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn') void refresh()
      if (payload.event === 'signedOut' || payload.event === 'tokenRefresh_failure') {
        queryClient.clear()
        setUsername(null)
        setStatus('signedOut')
      }
    })
  }, [queryClient, refresh, endSession])

  const value = useMemo(
    () => ({ status, username, didSignOut, signOut, refresh }),
    [status, username, didSignOut, signOut, refresh],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
