import { useSyncExternalStore } from 'react'

const subscribe = (onChange: () => void) => {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

// Whether the browser thinks it has a connection (navigator.onLine), live.
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine)
}
