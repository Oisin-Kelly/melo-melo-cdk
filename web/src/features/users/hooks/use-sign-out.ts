import { useNavigate } from 'react-router'
import { useAuth } from '@/lib/auth/auth-context'

// Sign out and land on the public landing page (desktop avatar menu, phone account menu).
export function useSignOut() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  return async () => {
    await signOut()
    navigate('/', { replace: true })
  }
}
