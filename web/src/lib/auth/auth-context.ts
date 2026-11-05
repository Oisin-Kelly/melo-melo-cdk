import { createContext, useContext } from 'react'

export type AuthStatus = 'loading' | 'signedIn' | 'signedOut'

type AuthContextValue = {
  status: AuthStatus
  /** The signed-in username, lowercased (the backend's one spelling). Null when signed out. */
  username: string | null
  /** True when the session ended because the user chose to sign out (not an expired or
   *  revoked session): leaving a protected page then goes home, not to sign-in with ?next=. */
  didSignOut: boolean
  signOut: () => Promise<void>
  /** Re-reads the session; await it after signing in, before navigating into the app. */
  refresh: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}

/** The signed-in username; only call this inside routes behind the auth guard. */
export function useUsername(): string {
  const { username } = useAuth()
  if (!username) throw new Error('useUsername called while signed out')
  return username
}
