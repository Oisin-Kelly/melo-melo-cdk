import { Theme } from '@astryxdesign/core'
import { QueryClientProvider } from '@tanstack/react-query'
import { Suspense, type ReactNode } from 'react'
import { Toaster } from 'sileo'
import { defaultThemeSlug, themes } from '@/astryx-themes'
import { ErrorBoundary } from '@/components/errors/error-boundary'
import { MainErrorFallback } from '@/components/errors/main-error-fallback'
import { queryClient } from '@/lib/react-query'
import './toast.css'

// Global providers, outermost-first. ErrorBoundary wraps <Theme> on purpose so a
// theme-setup failure is still caught (its fallback is intentionally theme-free).
// Toasts come from Sileo (Astryx has no toast): call `sileo.success/error/…` from anywhere.
export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ErrorBoundary fallback={<MainErrorFallback />}>
        <Theme theme={themes[defaultThemeSlug]}>
          <QueryClientProvider client={queryClient}>
            {children}
            <Toaster position="top-center" theme="system" />
          </QueryClientProvider>
        </Theme>
      </ErrorBoundary>
    </Suspense>
  )
}
