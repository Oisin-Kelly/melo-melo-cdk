import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { useState } from 'react'
import { useSignOut } from '../hooks/use-sign-out'

// "Sign out?" before signing out (desktop avatar menu, phone Settings), so a stray tap
// doesn't drop you back at the login screen
export function SignOutDialog({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const signOut = useSignOut()
  const [isSigningOut, setIsSigningOut] = useState(false)

  return (
    <AlertDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Sign out?"
      description="You'll need your password to sign back in."
      actionLabel="Sign out"
      isActionLoading={isSigningOut}
      onAction={async () => {
        setIsSigningOut(true)
        await signOut()
      }}
    />
  )
}
