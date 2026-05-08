// Booklage Service Worker
// Cache strategy:
//   - Pre-cache: /board (main app), manifest, icons
//   - Cache-first: /_next/static/* (hashed immutable assets)
//   - Network-first: HTML pages and other assets
//   - Skip: API calls, non-GET requests

// Bump on each deploy to force clients to flush old caches.
const CACHE_VERSION = 'v73-2026-05-09-pip-companion'
const CACHE_NAME = 'booklage-' + CACHE_VERSION

var PRECACHE_URLS = [
  '/board',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
]

// ── Install: pre-cache shell ──────────────────────────────
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS)
    }).then(function () {
      return self.skipWaiting()
    })
  )
})

// ── Activate: clean old caches ────────────────────────────
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) {
            return key.startsWith('booklage-') && key !== CACHE_NAME
          })
          .map(function (key) {
            return caches.delete(key)
          })
      )
    }).then(function () {
      return self.clients.claim()
    })
  )
})

// ── Fetch: routing by URL pattern ─────────────────────────
self.addEventListener('fetch', function (event) {
  var request = event.request

  // Skip non-GET requests
  if (request.method !== 'GET') return

  var url = new URL(request.url)

  // Skip API calls — OGP fetch requires network
  if (url.pathname.startsWith('/api/')) return

  // Cache-first for hashed static assets (immutable — filename contains hash)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(function (cached) {
        if (cached) return cached
        return fetch(request).then(function (response) {
          if (response.ok) {
            var clone = response.clone()
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(request, clone)
            })
          }
          return response
        })
      })
    )
    return
  }

  // Network-first for HTML pages and other assets
  event.respondWith(
    fetch(request).then(function (response) {
      if (response.ok) {
        var clone = response.clone()
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(request, clone)
        })
      }
      return response
    }).catch(function () {
      return caches.match(request)
    })
  )
})
