import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { HStack } from '@astryxdesign/core/HStack'
import { useEffect } from 'react'
import { useRouteError } from 'react-router'
import { Illustration } from '@/components/illustrations/illustration'

const RELOAD_FLAG = 'melomelo.chunk-reload-at'

// A lazily-loaded chunk that no longer exists: after a deploy replaces the old
// hashed files, or in dev when Vite re-optimises a dependency ("Outdated Optimize Dep").
function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Outdated Optimize Dep/i.test(
    message,
  )
}

// Reload at most once a minute, so a genuinely broken chunk can't loop the page.
function shouldAutoReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) ?? 0)
    if (Date.now() - last < 60_000) return false
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()))
    return true
  } catch {
    return false
  }
}

// Root route error screen: replaces React Router's raw developer error page.
export function RouteError() {
  const error = useRouteError()
  const reloading = isChunkLoadError(error) && shouldAutoReload()

  useEffect(() => {
    if (reloading) window.location.reload()
    else console.error(error)
  }, [reloading, error])

  if (reloading) return null

  return (
    <Center axis="both" minHeight="100dvh" padding={6}>
      <EmptyState
        icon={<Illustration name="lost" />}
        title="Something went wrong"
        description="Reloading usually fixes it."
        actions={
          <HStack gap={2}>
            <Button label="Reload" variant="primary" onClick={() => window.location.reload()} />
            <Button label="Go home" href="/" />
          </HStack>
        }
      />
    </Center>
  )
}
