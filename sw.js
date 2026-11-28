// Casa Canela · service worker: la app abre rápido y sin señal; los datos vienen de la API (y la app guarda una copia).
const V = 'cc-v4e';
const SHELL = ['/', '/index.html', '/app.js', '/engine.js', '/cal.js', '/demo-semana.js', '/logo.svg', '/logo-icono.svg', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL).catch(() => { }))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    if (u.pathname.endsWith('version.json')) return; // siempre a la red
    // primero la red (para tener siempre la última versión); sin señal, lo guardado
    e.respondWith(fetch(req, { cache: 'no-store' }).then(r => { if (r.ok) { const c = r.clone(); caches.open(V).then(x => x.put(u.pathname === '/' || req.mode === 'navigate' ? '/index.html' : req, c)); } return r; })
      .catch(() => caches.match(req.mode === 'navigate' ? '/index.html' : req, { ignoreSearch: true }).then(r => r || caches.match('/index.html'))));
    return;
  }
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com/.test(u.hostname)) {
    e.respondWith(caches.open(V).then(c => c.match(req).then(m => { const f = fetch(req).then(r => { c.put(req, r.clone()); return r; }).catch(() => m); return m || f; })));
  }
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Casa Canela', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Casa Canela', { body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { const c = cs.find(x => 'focus' in x); if (c) { c.navigate ? c.navigate(url).catch(() => { }) : null; return c.focus(); } return self.clients.openWindow(url); }));
});
