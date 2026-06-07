/* ================================================================
   ARPlan Pro — Service Worker v1.2.0
   Estrategia:
     Core assets  → Cache-first (offline funcional)
     CDN (Three.js, Tabler) → Stale-while-revalidate
   Cachea solo archivos reales del repositorio
================================================================ */
const APP_VERSION = '1.2.0';
const CACHE_CORE  = `arplan-v${APP_VERSION}-core`;
const CACHE_CDN   = `arplan-v${APP_VERSION}-cdn`;

/* Archivos propios que se pre-cachean al instalar */
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

/* Orígenes CDN que se cachean bajo demanda */
const CDN_ORIGINS = [
  'cdn.jsdelivr.net',
  'ajax.googleapis.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

/* ── INSTALL ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_CORE)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] install error:', err))
  );
});

/* ── ACTIVATE: limpiar versiones anteriores ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_CORE && k !== CACHE_CDN)
          .map(k => {
            console.log('[SW] deleting old cache:', k);
            return caches.delete(k);
          })
      ))
      .then(() => self.clients.claim())
  );
});

/* ── FETCH ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* Solo GET */
  if (request.method !== 'GET') return;

  /* Solo HTTP/HTTPS */
  if (!url.protocol.startsWith('http')) return;

  /* CDN → stale-while-revalidate */
  if (CDN_ORIGINS.some(o => url.hostname.includes(o))) {
    event.respondWith(staleWhileRevalidate(request, CACHE_CDN));
    return;
  }

  /* Archivos propios → cache-first */
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, CACHE_CORE));
    return;
  }

  /* Todo lo demás → red directa (APIs GPS, WebXR, etc.) */
});

/* ── Estrategias ── */

async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (_) {
    return offlineFallback();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || (await fetchPromise) || offlineFallback();
}

/* ── Página offline ── */
function offlineFallback() {
  return new Response(
    `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ARPlan Pro — Sin conexión</title>
  <style>
    body{
      margin:0;background:#0d1117;color:#f1f5f9;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      display:flex;flex-direction:column;align-items:center;
      justify-content:center;min-height:100vh;text-align:center;padding:24px;
    }
    h1{font-size:20px;font-weight:500;margin-bottom:8px;}
    p{font-size:14px;color:#94a3b8;margin-bottom:24px;line-height:1.6;}
    button{
      padding:11px 28px;background:#3b82f6;color:#fff;
      border:none;border-radius:22px;font-size:14px;cursor:pointer;
    }
    .version{position:fixed;bottom:12px;right:12px;font-size:10px;color:#374151;}
  </style>
</head>
<body>
  <h1>Sin conexión</h1>
  <p>ARPlan Pro no pudo cargar.<br>
     Verifica tu conexión a internet<br>
     o espera a que se descargue el caché.</p>
  <button onclick="location.reload()">Reintentar</button>
  <div class="version">v${APP_VERSION}</div>
</body>
</html>`,
    {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    }
  );
}

/* ── Mensajes desde la app ── */
self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data.type === 'CLEAR_CDN_CACHE') {
    caches.delete(CACHE_CDN).then(() => {
      event.ports[0]?.postMessage({ ok: true });
    });
  }
});
