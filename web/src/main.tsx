import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/app'
// Base styles — without these, Astryx components render unstyled. The theme's
// own CSS + fonts are pulled in by @/astryx-themes (imported in the provider).
import '@astryxdesign/core/reset.css'
import '@astryxdesign/core/astryx.css'
import '@/app/global.css'

// Keeps a copy of the app so it opens offline (public/sw.js). Production only: in dev it
// would serve stale modules over Vite's.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
