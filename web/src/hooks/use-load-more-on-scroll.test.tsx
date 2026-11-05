import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLoadMoreOnScroll } from './use-load-more-on-scroll'

// A controllable IntersectionObserver: tests fire intersections by hand
type Callback = (entries: { isIntersecting: boolean }[]) => void
const observers: { callback: Callback; options: IntersectionObserverInit; observed: Element[]; disconnected: boolean }[] = []

class FakeObserver {
  private record
  constructor(callback: Callback, options: IntersectionObserverInit) {
    this.record = { callback, options, observed: [] as Element[], disconnected: false }
    observers.push(this.record)
  }
  observe(el: Element) {
    this.record.observed.push(el)
  }
  disconnect() {
    this.record.disconnected = true
  }
}

vi.stubGlobal('IntersectionObserver', FakeObserver)
afterEach(() => {
  observers.length = 0
})

function List({ enabled, onReach }: { enabled: boolean; onReach: () => void }) {
  const marker = useLoadMoreOnScroll(enabled, onReach)
  return <div ref={marker} data-testid="marker" />
}

describe('useLoadMoreOnScroll', () => {
  it('watches the marker 400px early and calls onReach when it comes into view', () => {
    const onReach = vi.fn()
    render(<List enabled onReach={onReach} />)

    expect(observers).toHaveLength(1)
    expect(observers[0].options).toEqual({ rootMargin: '400px 0px' })

    observers[0].callback([{ isIntersecting: false }])
    expect(onReach).not.toHaveBeenCalled()
    observers[0].callback([{ isIntersecting: true }])
    expect(onReach).toHaveBeenCalledTimes(1)
  })

  it('does not watch while disabled (no more pages), and stops when it becomes disabled', () => {
    const { rerender } = render(<List enabled={false} onReach={vi.fn()} />)
    expect(observers).toHaveLength(0)

    rerender(<List enabled onReach={vi.fn()} />)
    expect(observers).toHaveLength(1)
    rerender(<List enabled={false} onReach={vi.fn()} />)
    expect(observers[0].disconnected).toBe(true)
  })

  it('always calls the latest onReach without re-observing', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<List enabled onReach={first} />)

    rerender(<List enabled onReach={second} />)
    observers[0].callback([{ isIntersecting: true }])

    expect(observers).toHaveLength(1)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
