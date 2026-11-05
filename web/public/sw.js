// MeloMelo's service worker: keeps a copy of the app itself (not your data) so it still
// opens with no connection and can say "It looks like you're offline" instead of the
// browser's error page. Hand-written and dependency-free; registered in production only
// (src/main.tsx). Served no-cache by web-stack, so a new version is picked up on the
// next visit.
//
//  - Install: fetch index.html and save it plus every script/stylesheet it references.
//  - Pages (navigations): network first, falling back to the saved index.html — the SPA
//    routes everything through it. A successful load refreshes the saved copy, but only
//    when it's HTML: opening a static file directly (/manifest.webmanifest, /favicon.svg)
//    is a navigation too, and saving that would make it the offline "app".
//  - /assets/*: content-hashed (a new deploy means new names), so cache-first; anything
//    not saved yet is fetched and saved, which also picks up lazily loaded chunks.
//  - Everything else, including all API calls (another origin), passes straight through.
const CACHE = 'melomelo-app-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      const response = await fetch('/index.html', { cache: 'no-cache' })
      const html = await response.clone().text()
      const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
      await cache.put('/index.html', response)
      await cache.addAll(assets)
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request)
          if (response.ok && response.headers.get('Content-Type')?.startsWith('text/html'))
            (await caches.open(CACHE)).put('/index.html', response.clone())
          return response
        } catch {
          return (await caches.match('/index.html')) ?? Response.error()
        }
      })(),
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok) (await caches.open(CACHE)).put(request, response.clone())
        return response
      })(),
    )
  }
})
