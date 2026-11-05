import { useEffect } from 'react'

// AppShell's scrolling content area (Astryx's MAIN_CONTENT_ID; not exported)
const MAIN_ID = 'astryx-app-shell-main'
/** Fully scrolled-down size of the header logo. */
const MIN_SCALE = 0.87
/** Pixels of scrolling to go between full size and MIN_SCALE. */
const RANGE_PX = 80

// The header logo follows the scroll: scrolling down shrinks it a little (to 87%),
// scrolling back up grows it again, in step with the scroll rather than on a timer;
// at the very top it's always full size. Writes one CSS variable on the top nav
// (read by app-shell.css), so scrolling never re-renders React.
export function useLogoScrollScale() {
  useEffect(() => {
    const main = document.getElementById(MAIN_ID)
    const nav = document.querySelector<HTMLElement>('.astryx-top-nav')
    if (!main || !nav) return

    let scale = 1
    let lastTop = main.scrollTop
    let frame = 0

    const onScroll = () => {
      const top = main.scrollTop
      // iOS overscroll at the top reads as negative: treat it as the top
      scale =
        top <= 0 ? 1 : Math.min(1, Math.max(MIN_SCALE, scale - ((top - lastTop) * (1 - MIN_SCALE)) / RANGE_PX))
      lastTop = top
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => nav.style.setProperty('--mm-logo-scale', String(scale)))
    }

    main.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      main.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
      nav.style.removeProperty('--mm-logo-scale')
    }
  }, [])
}
