import { useEffect, useRef, type RefObject } from 'react'

// Calls `onReach` when an invisible marker at the end of a list scrolls near the
// viewport (400px early, so the next page is usually loaded before the user gets
// there). Works inside any scroll container: the observer root is the viewport, and
// IntersectionObserver accounts for clipping by scrolling ancestors.
export function useLoadMoreOnScroll(
  enabled: boolean,
  onReach: () => void,
): RefObject<HTMLDivElement | null> {
  const markerRef = useRef<HTMLDivElement | null>(null)
  const callback = useRef(onReach)
  useEffect(() => {
    callback.current = onReach
  })

  useEffect(() => {
    const marker = markerRef.current
    if (!enabled || !marker) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) callback.current()
      },
      { rootMargin: '400px 0px' },
    )
    observer.observe(marker)
    return () => observer.disconnect()
  }, [enabled])

  return markerRef
}
