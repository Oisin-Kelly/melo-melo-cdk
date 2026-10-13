import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/app'
// Base styles — without these, Astryx components render unstyled. The theme's
// own CSS + fonts are pulled in by @/astryx-themes (imported in the provider).
import '@astryxdesign/core/reset.css'
import '@astryxdesign/core/astryx.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
