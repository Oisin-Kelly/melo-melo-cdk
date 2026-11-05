import { readPendingInvitePath } from '@/lib/share-links'

// Where to go after signing in. Only same-app paths are honoured (never an absolute
// or protocol-relative URL), so ?next= can't be used to bounce users off-site.
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

/** After signing in (or verifying): ?next=, else a share link opened while signed out in the
 *  last day — people often finish signing up in another tab, which loses ?next= — else home. */
export function afterAuthPath(params: URLSearchParams): string {
  return safeNext(params.get('next') ?? readPendingInvitePath())
}

/** `path` with the current ?next= carried along, so it survives every step of signing up. */
export function withNext(path: string, params: URLSearchParams): string {
  const next = params.get('next')
  if (!next) return path
  return `${path}${path.includes('?') ? '&' : '?'}next=${encodeURIComponent(next)}`
}
