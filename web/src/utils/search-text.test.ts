import { describe, expect, it } from 'vitest'
import { matchesWords, normalise } from './search-text'

describe('normalise', () => {
  it('lowercases, trims and strips accents', () => {
    expect(normalise('  Beyoncé ')).toBe('beyonce')
    expect(normalise('CAFÉ Del Mar')).toBe('cafe del mar')
  })
})

describe('matchesWords', () => {
  const haystack = normalise('Summer Demos Oisín Kelly oisinkelly')

  it('needs every word, in any order, accents ignored', () => {
    expect(matchesWords(haystack, 'demos summer')).toBe(true)
    expect(matchesWords(haystack, 'Oisín')).toBe(true)
    expect(matchesWords(haystack, 'summer winter')).toBe(false)
  })

  it('matches nothing for a blank query', () => {
    expect(matchesWords(haystack, '   ')).toBe(false)
  })
})
