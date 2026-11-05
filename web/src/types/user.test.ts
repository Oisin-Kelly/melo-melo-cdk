import { describe, expect, it } from 'vitest'
import { nameOf } from './user'

describe('nameOf', () => {
  it('prefers the display name, trimmed', () => {
    expect(nameOf({ username: 'oisin', displayName: '  Oisín Kelly ' })).toBe('Oisín Kelly')
  })

  it.each([null, '', '   '])('falls back to the username when the display name is %j', (displayName) => {
    expect(nameOf({ username: 'oisin', displayName })).toBe('oisin')
  })
})
