import { defineTheme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral'

// MeloMelo's theme: Astryx neutral with the logo's teal as the accent (primary buttons,
// links, focus rings, spinners). Brand colours live here — in the theme — never as
// :root overrides or hex values in components. Each value is [light, dark]: light is a
// deeper teal than the logo so white button text keeps >=4.5:1 contrast; dark uses a
// brighter teal with dark text on it.
//
// Pre-built (no runtime style injection): after editing, run `npm run theme:build`.
export const melomeloTheme = defineTheme({
  name: 'melomelo',
  extends: neutralTheme,
  // The whole type scale from one knob: neutral's compact 14px base made the nav and
  // body text look small next to the big detail-page titles. 15px, same 1.2 ratio, so
  // every size steps up together.
  typography: { scale: { base: 15, ratio: 1.2 } },
  tokens: {
    '--color-accent': ['#0a7c8c', '#4cc9da'],
    '--color-accent-muted': ['#e3f4f6', '#11363c'],
    '--color-on-accent': ['#ffffff', '#04191c'],
    '--color-text-accent': ['#0a7c8c', '#6dd5e3'],
    // Apple's system teal (light / dark) — the wordmark's colour. Unused elsewhere,
    // so the logo owns this token.
    '--color-text-teal': ['#30b0c7', '#40c8e0'],
    // A liked heart: a strong red in both modes (the theme's error red is a dark maroon
    // on light and a pale pink on dark — right for messages, weak for a heart). Themes
    // can't add token names, so the heart owns the palette's red icon token, unused
    // elsewhere (as the wordmark owns the teal above).
    '--color-icon-red': ['#e5233b', '#ff4d5e'],
  },
  components: {
    // Neutral paints accent status dots its own blue; ours are the accent teal, like the
    // "New since your last visit" label they sit under (Home's new shares, unread activity)
    'status-dot': { 'variant:accent': { backgroundColor: 'var(--color-accent)' } },
  },
})

export default melomeloTheme
