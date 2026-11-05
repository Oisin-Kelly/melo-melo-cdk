import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// The page's link-preview card (Open Graph): what WhatsApp, iMessage, Slack… show when a
// MeloMelo link is pasted. Their crawlers don't run JavaScript, so it's the same generic card
// for every URL. The image wants an absolute URL: VITE_SITE_URL (written by
// scripts/deploy-web.sh from web-stack's WebUrl) when known, else a relative one, which most
// chat apps still resolve.
function openGraph(): Plugin {
  let base = ''
  return {
    name: 'melomelo-open-graph',
    // The env for this build's mode (.env.production.local on deploys)
    configResolved: (config) => {
      base = String(config.env.VITE_SITE_URL ?? '').replace(/\/+$/, '')
    },
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { name: 'description', content: 'Share your tracks privately with friends.' }, injectTo: 'head' },
      { tag: 'meta', attrs: { property: 'og:type', content: 'website' }, injectTo: 'head' },
      { tag: 'meta', attrs: { property: 'og:site_name', content: 'MeloMelo' }, injectTo: 'head' },
      { tag: 'meta', attrs: { property: 'og:title', content: 'MeloMelo' }, injectTo: 'head' },
      { tag: 'meta', attrs: { property: 'og:description', content: 'Share your tracks privately with friends.' }, injectTo: 'head' },
      { tag: 'meta', attrs: { property: 'og:image', content: `${base}/og-image.png` }, injectTo: 'head' },
      { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' }, injectTo: 'head' },
      { tag: 'meta', attrs: { property: 'og:image:height', content: '630' }, injectTo: 'head' },
      { tag: 'meta', attrs: { property: 'og:image:alt', content: 'MeloMelo — private music sharing' }, injectTo: 'head' },
      { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' }, injectTo: 'head' },
    ],
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), openGraph()],
  resolve: {
    // `@/…` → src/… — the bulletproof-react import convention. Must stay in
    // sync with the `paths` mapping in tsconfig.app.json.
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
})
