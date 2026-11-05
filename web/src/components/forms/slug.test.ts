import { describe, expect, it } from 'vitest'
import { LIMITS } from '@/config/limits'
import { normaliseSlug, slugError } from './slug'

describe('normaliseSlug', () => {
  it('lowercases and turns spaces and underscores into dashes as you type', () => {
    expect(normaliseSlug('Summer Demos_2')).toBe('summer-demos-2')
    expect(normaliseSlug('a   b')).toBe('a-b')
  })

  it('leaves other characters for the format check to report', () => {
    expect(normaliseSlug('Café!')).toBe('café!')
  })
})

describe('slugError', () => {
  it.each(['a', 'my-song', 'track-01', 'x'.repeat(LIMITS.slug)])('accepts %j', (slug) => {
    expect(slugError(slug)).toBeNull()
  })

  it('requires something', () => {
    expect(slugError('')).toBe('Give it a URL.')
  })

  it('caps the length at the API limit', () => {
    expect(slugError('x'.repeat(LIMITS.slug + 1))).toBe(`Keep it to ${LIMITS.slug} characters.`)
  })

  it.each(['My-Song', 'my--song', '-my-song', 'my-song-', 'my_song', 'café', 'my song'])(
    'rejects the shape %j',
    (slug) => {
      expect(slugError(slug)).toBe('Use lowercase letters, numbers and single dashes.')
    },
  )
})
