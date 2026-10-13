import { env } from '@/config/env'
import type { ErrorResponse } from '@/types/api'

// Thin fetch wrapper around the MeloMelo HTTP API. Prepends the base URL, sends
// JSON, attaches a bearer token when signed in, and normalises error bodies into
// `ApiError`.
//
// Auth is a feature yet to be built — `getToken` is the seam it will wire into
// via `setAuthTokenProvider`. Deliberately no assumptions here about where/how
// the token is stored; that contract belongs to the auth feature.
let getToken: () => string | null = () => null

export function setAuthTokenProvider(provider: () => string | null): void {
  getToken = provider
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

type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown }

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options
  const token = getToken()

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
