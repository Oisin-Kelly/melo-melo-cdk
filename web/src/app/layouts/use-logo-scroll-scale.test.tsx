import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLogoScrollScale } from './use-logo-scroll-scale'

function Shell() {
  useLogoScrollScale()
  return null
}

let main: HTMLElement
let nav: HTMLElement

beforeEach(() => {
  // AppShell's scroll container and top nav, which the hook finds by id/class
  main = document.createElement('div')
  main.id = 'astryx-app-shell-main'
  nav = document.createElement('div')
  nav.className = 'astryx-top-nav'
  document.body.append(main, nav)
  // Run animation frames immediately
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  main.remove()
  nav.remove()
  vi.unstubAllGlobals()
})

const scrollTo = (top: number) => {
  main.scrollTop = top
  main.dispatchEvent(new Event('scroll'))
}
const scale = () => Number(nav.style.getPropertyValue('--mm-logo-scale'))

describe('useLogoScrollScale', () => {
  it('shrinks the logo as you scroll down, down to 87%', () => {
    render(<Shell />)

    scrollTo(40)
    expect(scale()).toBeCloseTo(1 - 0.13 / 2) // halfway through the 80px range

    scrollTo(500)
    expect(scale()).toBeCloseTo(0.87)
  })

  it('grows it back as you scroll up, and is full size at the top (iOS overscroll included)', () => {
    render(<Shell />)
    scrollTo(500)

    scrollTo(460)
    expect(scale()).toBeCloseTo(0.87 + 0.13 / 2)

    scrollTo(-20)
    expect(scale()).toBe(1)
  })

  it('stops following the scroll and resets the logo when unmounted', () => {
    const { unmount } = render(<Shell />)
    scrollTo(500)

    unmount()
    scrollTo(0)

    expect(nav.style.getPropertyValue('--mm-logo-scale')).toBe('')
  })

  it('does nothing outside the app shell', () => {
    main.remove()
    expect(() => render(<Shell />)).not.toThrow()
  })
})
