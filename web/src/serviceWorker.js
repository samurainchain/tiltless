// Tiltless's service worker: makes the installed app open without a connection.
// Built by vite.config.ts into sw.js, which fills in BUILD_ID and PRECACHE: every file of this
// build except the screenshot reader's engine (about 12 MB), cached the first time it's used.
// Pages: network first, falling back to the cached copy. Built assets and the reader's files:
// cache first, since a given URL never changes. Only same-origin GET requests are handled; sync
// with Supabase always goes to the network.

const CACHE = `mirror-${self.BUILD_ID}`
// The front page and the journal's page, at the site's root and /app/.
const SHELL = ['./', './app/', ...self.PRECACHE]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

// Module scripts are requested with an Origin header and some hosts answer "Vary: Origin";
// the files don't depend on it, so cached copies match regardless.
const match = (request) => caches.match(request, { ignoreVary: true })

const immutable = (url) => url.pathname.includes('/assets/') || url.pathname.includes('/tesseract/') || url.pathname.includes('/icons/')

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (immutable(url)) {
    event.respondWith(
      match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) void caches.open(CACHE).then((cache) => cache.put(request, response.clone()))
            return response
          }),
      ),
    )
    return
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) void caches.open(CACHE).then((cache) => cache.put(request, response.clone()))
        return response
      })
      .catch(async () => (await match(request)) ?? (request.mode === 'navigate' ? match(new Request(url.pathname.startsWith('/app') ? './app/' : './')) : Response.error())),
  )
})

// Web push (SPEC section 4.10): the evening summary and the review reminder, sent by the
// telegram-digest function. The message is { title, body, url, tag }.
self.addEventListener('push', (event) => {
  let message = { title: 'Tiltless', body: '', url: './app/#/today', tag: 'tiltless' }
  try {
    message = { ...message, ...event.data.json() }
  } catch {
    if (event.data) message.body = event.data.text()
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: message.url },
    }),
  )
})

// A click opens the journal at the message's screen, reusing an open journal tab.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url ?? './app/#/today', self.location.origin)
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).pathname.startsWith('/app'))
      if (open) return open.navigate(target.href).then((client) => (client ?? open).focus())
      return self.clients.openWindow(target.href)
    }),
  )
})
