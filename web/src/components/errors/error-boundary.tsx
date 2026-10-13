import { Component, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  fallback: ReactNode
  children: ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
}

// Minimal top-level error boundary (kept local to avoid a react-error-boundary
// dependency). Catches render-time errors anywhere below it and shows `fallback`.
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('Uncaught render error:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}
