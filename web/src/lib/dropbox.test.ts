import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { setAuthTokenProvider } from './api-client'
import { API, server } from '@/testing/server'
import { stageUpload } from './dropbox'

const S3 = 'https://dropbox.s3.test/upload'

afterEach(() => setAuthTokenProvider(async () => null))

function stage(onPresign?: (key: string) => void, put = () => new HttpResponse(null, { status: 200 })) {
  const uploads: { auth: string | null; type: string | null; size: number }[] = []
  server.use(
    http.get(`${API}/buckets/dropbox`, ({ request }) => {
      const key = new URL(request.url).searchParams.get('key')!
      onPresign?.(key)
      return HttpResponse.json({ url: S3, key: `me/${key}` })
    }),
    http.put(S3, async ({ request }) => {
      uploads.push({
        auth: request.headers.get('Authorization'),
        type: request.headers.get('Content-Type'),
        size: (await request.arrayBuffer()).byteLength,
      })
      return put()
    }),
  )
  return uploads
}

describe('stageUpload', () => {
  it('presigns a key in the folder, PUTs the file to S3 and returns the staged key', async () => {
    let asked = ''
    const uploads = stage((key) => (asked = key))

    const key = await stageUpload(new File(['abc'], 'Cover.JPG', { type: 'image/jpeg' }), 'albums')

    expect(asked).toMatch(/^albums\/[0-9a-f-]{36}\.jpg$/) // extension lowercased
    expect(key).toBe(`me/${asked}`)
    expect(uploads).toEqual([{ auth: null, type: 'image/jpeg', size: 3 }])
  })

  it('never sends the API token to S3 (the signature is the credential)', async () => {
    setAuthTokenProvider(async () => 'secret-token')
    let presignAuth: string | null = null
    const uploads = stage()
    // Replaces stage()'s presign handler (later handlers win) to also see the request's headers
    server.use(
      http.get(`${API}/buckets/dropbox`, ({ request }) => {
        presignAuth = request.headers.get('Authorization')
        return HttpResponse.json({ url: S3, key: 'k' })
      }),
    )

    await stageUpload(new File(['x'], 'a.png', { type: 'image/png' }), 'profile')

    expect(presignAuth).toBe('Bearer secret-token')
    expect(uploads[0].auth).toBeNull()
  })

  it("uses .bin and a generic type when the file has no extension or type", async () => {
    let asked = ''
    const uploads = stage((key) => (asked = key))

    await stageUpload(new File(['x'], 'noextension'), 'tracks')

    expect(asked).toMatch(/\.bin$/)
    expect(uploads[0].type).toBe('application/octet-stream')
  })

  it('throws when S3 refuses the upload', async () => {
    stage(undefined, () => new HttpResponse(null, { status: 403 }))

    await expect(stageUpload(new File(['x'], 'a.png'), 'albums')).rejects.toThrow('Upload failed (403)')
  })
})
