import { http, HttpResponse, type JsonBodyType } from 'msw'
import { API, server } from './server'

/** Serves the dropbox presign + S3 PUT, so a mutation that stages a cover can run.
 *  The staged key comes back as `me/{requested key}`. */
export function serveStageUpload() {
  server.use(
    http.get(`${API}/buckets/dropbox`, ({ request }) =>
      HttpResponse.json({ url: 'https://s3.test/put', key: `me/${new URL(request.url).searchParams.get('key')}` }),
    ),
    http.put('https://s3.test/put', () => new HttpResponse(null, { status: 200 })),
  )
}

/** Captures the JSON bodies sent to one endpoint, answering with `response`. */
export function captureBodies(method: 'post' | 'put', path: string, response: unknown = {}) {
  const bodies: Record<string, unknown>[] = []
  server.use(
    http[method](`${API}${path}`, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json(response as JsonBodyType)
    }),
  )
  return bodies
}

export const coverFile = (name = 'cover.png') => new File(['img'], name, { type: 'image/png' })
