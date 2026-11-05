import { describe, expect, it } from 'vitest'
import { userSummary } from '@/testing/fixtures'
import { matchesPerson } from './matches-person'

const ada = userSummary('ada.l', { displayName: 'Ada Lovelace' })

describe('matchesPerson', () => {
  it.each(['', '   '])('an empty query (%j) matches everyone', (q) => {
    expect(matchesPerson(ada, q)).toBe(true)
  })

  it.each(['ada.l', '@ada', 'ADA', 'lovelace', ' love '])('matches %j on username or name', (q) => {
    expect(matchesPerson(ada, q)).toBe(true)
  })

  it('does not match someone else', () => {
    expect(matchesPerson(ada, 'grace')).toBe(false)
  })

  it('falls back to the username when there is no display name', () => {
    expect(matchesPerson(userSummary('grace'), 'grac')).toBe(true)
  })
})
