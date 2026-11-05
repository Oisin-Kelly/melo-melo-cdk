import { env } from '@/config/env'
import type { ErrorResponse } from '@/types/api'

// Thin fetch wrapper around the MeloMelo HTTP API. Prepends the base URL, sends
// JSON, attaches a bearer token when signed in, and normalises error bodies into
// `ApiError`.
//
// The auth feature wires itself in through these two seams, so this file makes no
// assumptions about where or how the token is stored. The provider is async because
// Amplify's fetchAuthSession() refreshes an expired token before returning it.
let getToken: () => Promise<string | null> = async () => null
let onUnauthorized: () => void = () => {}

export function setAuthTokenProvider(provider: () => Promise<string | null>): void {
  getToken = provider
}

/** Called on any 401 — the session is gone, so the auth feature signs out. */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler
}

export class ApiError extends Error {
  readonly status: number
  readonly body: ErrorResponse | null

  constructor(status: number, message: string, body: ErrorResponse | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/** 404: unknown, deleted, or not shared with you — the API doesn't say which. */
export const isNotFound = (error: unknown) => error instanceof ApiError && error.status === 404

type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown }

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options
  const token = await getToken()

  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!response.ok) {
    if (response.status === 401) onUnauthorized()
    const errorBody = (await response
      .json()
      .catch(() => null)) as ErrorResponse | null
    throw new ApiError(
      response.status,
      errorBody?.message ?? response.statusText,
      errorBody,
    )
  }

  // 204 No Content (and other empty bodies) — nothing to parse.
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
