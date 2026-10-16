// Service worker tối giản: chỉ cache file tĩnh có hash, không bao giờ cache /api
const CACHE = 'tb-static-v1'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url)
  if (e.request.method !== 'GET' || u.origin !== location.origin || !u.pathname.startsWith('/assets/')) return
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(e.request)
    if (hit) return hit
    const res = await fetch(e.request)
    if (res.ok) c.put(e.request, res.clone())
    return res
  }))
})
