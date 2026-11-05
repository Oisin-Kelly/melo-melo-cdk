import { describe, expect, it } from 'vitest'
import { afterAuthPath, safeNext, withNext } from './safe-next'

describe('safeNext', () => {
  it.each(['/library', '/oisin/my-song?x=1', '/'])('keeps the in-app path %s', (next) => {
    expect(safeNext(next)).toBe(next)
  })

  it.each([null, '', 'https://evil.example', '//evil.example/path', 'library', 'javascript:alert(1)'])(
    'sends anything off-site or malformed (%j) home',
    (next) => {
      expect(safeNext(next)).toBe('/')
    },
  )
})

describe('afterAuthPath', () => {
  it('prefers ?next=, then a remembered invite, then home', () => {
    localStorage.clear()
    expect(afterAuthPath(new URLSearchParams('next=%2Fliked'))).toBe('/liked')
    expect(afterAuthPath(new URLSearchParams())).toBe('/')
    localStorage.setItem('mm-pending-invite', JSON.stringify({ token: 'tok', savedAt: Date.now() }))
    expect(afterAuthPath(new URLSearchParams())).toBe('/s/tok')
    localStorage.setItem('mm-pending-invite', JSON.stringify({ token: 'tok', savedAt: Date.now() - 2 * 86_400_000 }))
    expect(afterAuthPath(new URLSearchParams())).toBe('/') // remembered for a day only
    localStorage.clear()
  })
})

describe('withNext', () => {
  it('carries ?next= onto another path', () => {
    const params = new URLSearchParams('next=%2Fs%2Ftok')
    expect(withNext('/login', params)).toBe('/login?next=%2Fs%2Ftok')
    expect(withNext('/verify?username=a', params)).toBe('/verify?username=a&next=%2Fs%2Ftok')
    expect(withNext('/login', new URLSearchParams())).toBe('/login')
  })
})
