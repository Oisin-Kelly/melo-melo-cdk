import { Center } from '@astryxdesign/core/Center'
import { Spinner } from '@astryxdesign/core/Spinner'
import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router'
import { afterAuthPath } from '@/features/auth/utils/safe-next'
import { useAuth } from '@/lib/auth/auth-context'

function FullPageSpinner() {
  return (
    <Center axis="both" minHeight="100dvh">
      <Spinner size="lg" />
    </Center>
  )
}

/**
 * The app's routes. Signed in → the shell. Signed out → `/` shows the public landing
 * page (`signedOutHome`) and every other app URL goes to sign-in, coming back after —
 * unless the user just signed out themselves, which goes home (no ?next= back to the
 * page they were leaving).
 */
export function RequireAuth({ signedOutHome, children }: { signedOutHome: ReactNode; children: ReactNode }) {
  const { status, didSignOut } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullPageSpinner />
  if (status === 'signedOut') {
    if (location.pathname === '/') return <>{signedOutHome}</>
    if (didSignOut) return <Navigate to="/" replace />
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return <>{children}</>
}

/** Sign-in / sign-up screens: already signed in → straight to where you were going. */
export function GuestOnly() {
  const { status } = useAuth()
  const [params] = useSearchParams()

  if (status === 'loading') return <FullPageSpinner />
  if (status === 'signedIn') return <Navigate to={afterAuthPath(params)} replace />
  return <Outlet />
}
