// miMuro Service Worker
// Basic offline support for the built app.
//
// Registered from main.js only in production (see there).
// Strategy: network-first for navigations so the HTML is
// never stale, and cache-first with background refresh for
// the static assets.

const CACHE_NAME = 'mimuro-v3'
const PRECACHE = ['/', '/index.html', '/manifest.json']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only GET, same-origin, non-API requests are handled here.
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== self.location.origin) return
  if (request.url.includes('/api/')) return

  // Navigations: try the network first so a new deploy is
  // picked up immediately; fall back to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy)))
          return response
        })
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  // Static assets: serve from cache and refresh in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)))
          }
          return response
        })
        .catch(() => cached)

      return cached || network
    })
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
