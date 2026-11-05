import { describe, expect, it } from 'vitest'
import { formatDate, formatDuration, formatLength, toUnixSeconds } from './format'

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [9, '0:09'],
    [154, '2:34'],
    [3600, '1:00:00'],
    [3725, '1:02:05'],
    [59.6, '1:00'], // rounds to the nearest second
    [-5, '0:00'], // never negative
  ])('%s s → %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })
})

describe('formatLength', () => {
  it.each([
    [0, '1 min'], // at least a minute
    [20, '1 min'],
    [1560, '26 min'],
    [3540, '59 min'],
    [3600, '1 hr'],
    [5400, '1 hr 30 min'],
    [7260, '2 hr 1 min'],
  ])('%s s → %s', (seconds, expected) => {
    expect(formatLength(seconds)).toBe(expected)
  })
})

describe('formatDate', () => {
  it('writes the day, full month and year', () => {
    // Locale-dependent order, so assert the parts rather than one exact string
    const text = formatDate(Date.UTC(2026, 9, 28, 12))
    expect(text).toContain('28')
    expect(text).toContain('October')
    expect(text).toContain('2026')
  })
})

describe('toUnixSeconds', () => {
  it('floors epoch ms to seconds', () => {
    expect(toUnixSeconds(1_700_000_000_999)).toBe(1_700_000_000)
  })
})
