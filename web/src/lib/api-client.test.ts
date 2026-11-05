import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { API, server } from '@/testing/server'
import { api, ApiError, isNotFound, setAuthTokenProvider, setUnauthorizedHandler } from './api-client'

// The seams are module state: put them back so other tests start signed out
afterEach(() => {
  setAuthTokenProvider(async () => null)
  setUnauthorizedHandler(() => {})
})

describe('api', () => {
  it('prefixes the base URL, sends JSON and parses the response', async () => {
    let seen: { url: string; method: string; contentType: string | null; body: unknown } | undefined
    server.use(
      http.post(`${API}/things`, async ({ request }) => {
        seen = {
          url: request.url,
          method: request.method,
          contentType: request.headers.get('Content-Type'),
          body: await request.json(),
        }
        return HttpResponse.json({ ok: true })
      }),
    )

    const result = await api<{ ok: boolean }>('/things', { method: 'POST', body: { a: 1 } })

    expect(result).toEqual({ ok: true })
    expect(seen).toEqual({ url: `${API}/things`, method: 'POST', contentType: 'application/json', body: { a: 1 } })
  })

  it('sends no body when none is given', async () => {
    let body: string | undefined
    server.use(
      http.get(`${API}/plain`, async ({ request }) => {
        body = await request.text()
        return HttpResponse.json({})
      }),
    )

    await api('/plain')

    expect(body).toBe('')
  })

  it('attaches the bearer token when signed in, and none when not', async () => {
    const auth: (string | null)[] = []
    server.use(
      http.get(`${API}/me`, ({ request }) => {
        auth.push(request.headers.get('Authorization'))
        return HttpResponse.json({})
      }),
    )

    await api('/me')
    setAuthTokenProvider(async () => 'tok-123')
    await api('/me')

    expect(auth).toEqual([null, 'Bearer tok-123'])
  })

  it("lets the caller's headers override the defaults", async () => {
    let contentType: string | null = null
    server.use(
      http.get(`${API}/csv`, ({ request }) => {
        contentType = request.headers.get('Content-Type')
        return HttpResponse.json({})
      }),
    )

    await api('/csv', { headers: { 'Content-Type': 'text/csv' } })

    expect(contentType).toBe('text/csv')
  })

  it('returns undefined for 204 No Content', async () => {
    server.use(http.get(`${API}/empty`, () => new HttpResponse(null, { status: 204 })))

    await expect(api('/empty')).resolves.toBeUndefined()
  })

  it("throws ApiError with the body's message and the error body", async () => {
    const body = { statusCode: 400, message: 'Name is required', error: 'Bad Request' }
    server.use(http.post(`${API}/things`, () => HttpResponse.json(body, { status: 400 })))

    const error = await api('/things', { method: 'POST' }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400, message: 'Name is required', body })
  })

  it('falls back to the status text when the error body is not JSON', async () => {
    server.use(http.get(`${API}/boom`, () => new HttpResponse('<html>', { status: 502, statusText: 'Bad Gateway' })))

    await expect(api('/boom')).rejects.toMatchObject({ status: 502, message: 'Bad Gateway', body: null })
  })

  it('calls the unauthorized handler on 401 only', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    server.use(
      http.get(`${API}/401`, () => HttpResponse.json({}, { status: 401 })),
      http.get(`${API}/403`, () => HttpResponse.json({}, { status: 403 })),
      http.get(`${API}/404`, () => HttpResponse.json({}, { status: 404 })),
    )

    await expect(api('/403')).rejects.toBeInstanceOf(ApiError)
    await expect(api('/404')).rejects.toBeInstanceOf(ApiError)
    expect(onUnauthorized).not.toHaveBeenCalled()

    await expect(api('/401')).rejects.toMatchObject({ status: 401 })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })
})

describe('isNotFound', () => {
  it('is true only for an ApiError with status 404', () => {
    expect(isNotFound(new ApiError(404, 'x', null))).toBe(true)
    expect(isNotFound(new ApiError(403, 'x', null))).toBe(false)
    expect(isNotFound(new Error('404'))).toBe(false)
    expect(isNotFound(undefined)).toBe(false)
  })
})
