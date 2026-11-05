import { describe, expect, it } from 'vitest'
import { LOADING_PHRASES, STILL_LOADING } from './loading-phrases'

describe('loading phrases', () => {
  it('every screen has at least one non-empty phrase', () => {
    for (const [what, phrases] of Object.entries(LOADING_PHRASES)) {
      expect(phrases.length, what).toBeGreaterThan(0)
      for (const phrase of phrases) expect(phrase.trim(), what).not.toBe('')
    }
  })

  it('the long-wait lines come in time order', () => {
    const times = STILL_LOADING.map((step) => step.afterMs)
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })
})
