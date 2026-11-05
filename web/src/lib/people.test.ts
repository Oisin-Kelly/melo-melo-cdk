import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { userSummary } from '@/testing/fixtures'
import { API, server } from '@/testing/server'
import { cleanUsernameQuery, searchPeople } from './people'

describe('cleanUsernameQuery', () => {
  it.each([
    ['  Oisin ', 'oisin'],
    ['@oisin', 'oisin'],
    ['o.kelly_2', 'o.kelly_2'],
    ['oisín kelly!', 'oisnkelly'],
    ['', ''],
  ])('%j → %j (only the username charset survives)', (input, expected) => {
    expect(cleanUsernameQuery(input)).toBe(expected)
  })
})

describe('searchPeople', () => {
  it('asks for the prefix with the limit and returns the people', async () => {
    let url: URL | undefined
    server.use(
      http.get(`${API}/users/search`, ({ request }) => {
        url = new URL(request.url)
        return HttpResponse.json({ items: [userSummary('oisin')], nextCursor: null })
      }),
    )

    const people = await searchPeople('ois', { limit: 5 })

    expect(people.map((p) => p.username)).toEqual(['oisin'])
    expect(url?.searchParams.get('q')).toBe('ois')
    expect(url?.searchParams.get('limit')).toBe('5')
  })
})
