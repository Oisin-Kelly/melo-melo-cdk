import { Theme } from '@astryxdesign/core'
import { QueryClientProvider } from '@tanstack/react-query'
import { Suspense, type ReactNode } from 'react'
import { Toaster } from 'sileo'
import { ErrorBoundary } from '@/components/errors/error-boundary'
import { MainErrorFallback } from '@/components/errors/main-error-fallback'
import { OnlineGate } from '@/components/feedback/offline-screen'
import { ThemeModeProvider } from '@/components/theme/theme-mode'
import { useThemeMode } from '@/components/theme/use-theme-mode'
import { AuthProvider } from '@/lib/auth/auth-provider'
import { brandTheme } from '@/lib/brand-theme'
import { queryClient } from '@/lib/react-query'

function ThemedApp({ children }: { children: ReactNode }) {
  const { mode } = useThemeMode()
  return (
    <Theme theme={brandTheme} mode={mode}>
      {children}
      <Toaster position="top-center" theme={mode} />
    </Theme>
  )
}

// Global providers, outermost-first. ErrorBoundary wraps <Theme> on purpose so a
// theme-setup failure is still caught (its fallback is intentionally theme-free).
// Toasts are Sileo (richer than Astryx's one-line Toast): call `sileo.success/error/…`.
// AuthProvider sits inside QueryClientProvider so signing out can clear the cache.
// OnlineGate swaps the whole app for the offline screen while there's no connection.
export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ErrorBoundary fallback={<MainErrorFallback />}>
        <ThemeModeProvider>
          <ThemedApp>
            <OnlineGate>
              <QueryClientProvider client={queryClient}>
                <AuthProvider>{children}</AuthProvider>
              </QueryClientProvider>
            </OnlineGate>
          </ThemedApp>
        </ThemeModeProvider>
      </ErrorBoundary>
    </Suspense>
  )
}
