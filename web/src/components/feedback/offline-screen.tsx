import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import type { ReactNode } from 'react'
import { sileo } from 'sileo'
import { Illustration } from '@/components/illustrations/illustration'
import { useIsOnline } from '@/hooks/use-is-online'

// With no connection, the whole app is replaced by a friendly offline screen (it can't
// load anything anyway); it switches back by itself as soon as the connection returns.
// Paired with the service worker (public/sw.js), this is also what you see opening
// MeloMelo offline, instead of the browser's error page.
export function OnlineGate({ children }: { children: ReactNode }) {
  const isOnline = useIsOnline()
  if (isOnline) return <>{children}</>

  // Reloading while still offline would only bring up the browser's own error page, so
  // check first: back online → reload; still offline → just say so
  const tryAgain = () => {
    if (navigator.onLine) window.location.reload()
    else sileo.info({ title: 'Still offline', description: "We'll reconnect as soon as you're back." })
  }

  return (
    <Center axis="both" minHeight="100dvh" padding={5}>
      <EmptyState
        icon={<Illustration name="offline" />}
        title="It looks like you're offline"
        description="MeloMelo needs a connection to bring in your music. We'll pick up right where you left off once you're back."
        actions={<Button label="Try again" variant="primary" onClick={tryAgain} />}
      />
    </Center>
  )
}
