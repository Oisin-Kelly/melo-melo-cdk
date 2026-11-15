/** A ref for a control that drags (the scrubber, a queue row's handle) inside Now playing's
 *  bottom sheet. The sheet listens for touches on its whole body and takes over any pull
 *  downwards to close itself, so a scrub that drifted down moved the sheet instead and the
 *  slider never heard the finger lift. Touches that start here stay here. */
export function ownTouches(node: HTMLElement | null) {
  if (!node) return
  const stop = (event: Event) => event.stopPropagation()
  const types = ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const
  for (const type of types) node.addEventListener(type, stop, { passive: true })
  return () => {
    for (const type of types) node.removeEventListener(type, stop)
  }
}
