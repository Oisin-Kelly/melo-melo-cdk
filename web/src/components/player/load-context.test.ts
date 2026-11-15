import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { trackSummary, userSummary } from '@/testing/fixtures'
import { API, server } from '@/testing/server'
import { feedContext, loadResumeContext, myTracksContext, sharedFromContext } from './load-context'

const bob = userSummary('bob', { displayName: 'Bob' })
const tracks = Array.from({ length: 6 }, (_, i) => trackSummary(`t${i + 1}`, { owner: bob }))
const ids = (list: { id: string }[]) => list.map((t) => t.id)

/** A paged list of `items`, two per page, recording each request's query. */
function paged<Item>(items: Item[], requests: URLSearchParams[]) {
  return ({ request }: { request: Request }) => {
    const params = new URL(request.url).searchParams
    requests.push(params)
    const at = Number(params.get('cursor') ?? 0)
    const next = at + 2 < items.length ? String(at + 2) : null
    return HttpResponse.json({ items: items.slice(at, at + 2), nextCursor: next })
  }
}

describe('loadResumeContext', () => {
  it('rebuilds Home (the server lowercases its id) up to the track, plus a page after it', async () => {
    const requests: URLSearchParams[] = []
    server.use(http.get(`${API}/feed`, paged(tracks.map((track) => ({ type: 'TRACK', track })), requests)))

    const loaded = await loadResumeContext({ contextType: 'LIST', contextId: 'feed:track:oldest', track: tracks[2] }, 'me')

    expect(loaded.context).toEqual(feedContext('TRACK', 'oldest'))
    expect(ids(loaded.tracks)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6'])
    expect(requests).toHaveLength(3)
    expect(requests[0].get('type')).toBe('TRACK')
    expect(requests[0].get('sort')).toBe('asc')
  })

  it('stops a page after the track, however long the list', async () => {
    const requests: URLSearchParams[] = []
    server.use(http.get(`${API}/feed`, paged(tracks.map((track) => ({ type: 'TRACK', track })), requests)))

    const loaded = await loadResumeContext({ contextType: 'LIST', contextId: 'feed:all:newest', track: tracks[0] }, 'me')

    expect(ids(loaded.tracks)).toEqual(['t1', 't2', 't3', 't4'])
    expect(requests[0].has('type')).toBe(false)
  })

  it('rebuilds the tracks someone shared with you, named after them', async () => {
    server.use(http.get(`${API}/users/bob/shared`, paged(tracks.map((track) => ({ track, sharedAt: 1 })), [])))

    const loaded = await loadResumeContext({ contextType: 'LIST', contextId: 'shared-from:bob', track: tracks[1] }, 'me')

    expect(loaded.context).toEqual(sharedFromContext(bob))
    expect(loaded.context.name).toBe('Shared by Bob')
    expect(ids(loaded.tracks)).toEqual(['t1', 't2', 't3', 't4'])
  })

  it('rebuilds your own tracks', async () => {
    server.use(http.get(`${API}/tracks`, paged(tracks, [])))

    const loaded = await loadResumeContext({ contextType: 'LIST', contextId: 'my-tracks', track: tracks[0] }, 'me')

    expect(loaded.context).toEqual(myTracksContext('me'))
  })

  it('resumes the track alone when its list no longer has it, can’t load, or isn’t known', async () => {
    server.use(
      http.get(`${API}/feed`, paged([{ type: 'TRACK', track: tracks[0] }], [])),
      http.get(`${API}/playlists/p1`, () => HttpResponse.json({ message: 'Not found' }, { status: 404 })),
    )
    const alone = { type: 'TRACK', id: 't5' }

    for (const resume of [
      { contextType: 'LIST' as const, contextId: 'feed:all:newest' },
      { contextType: 'PLAYLIST' as const, contextId: 'p1' },
      { contextType: 'LIST' as const, contextId: 'somewhere-new' },
    ]) {
      const loaded = await loadResumeContext({ ...resume, track: tracks[4] }, 'me')
      expect(loaded.context).toMatchObject(alone)
      expect(ids(loaded.tracks)).toEqual(['t5'])
    }
  })
})
