import { describe, expect, it } from 'vitest'
import { lengthError, multiLine, savedLength, singleLine } from './saved-text'

describe('saved text', () => {
  it('single line: trims, collapses spaces, turns line breaks into spaces', () => {
    expect(singleLine('  Oisín   Kelly \n ')).toBe('Oisín Kelly')
    expect(singleLine('a\nb')).toBe('a b')
  })

  it('multi line: keeps line breaks but at most one blank line in a row', () => {
    expect(multiLine('  one   two\n\n\n\nthree  ')).toBe('one two\n\nthree')
  })

  it('counts what gets saved, so trailing or doubled spaces never push a field over', () => {
    const thirty = 'a'.repeat(30)
    expect(savedLength(`${thirty} `)).toBe(30)
    expect(lengthError(`${thirty}   `, 30)).toBeNull()
    expect(lengthError(`${thirty}b`, 30)).toBe('Keep it to 30 characters.')
    expect(lengthError('a  b', 3)).toBeNull()
  })
})
