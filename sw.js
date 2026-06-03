/* ============================================================
   ARPlan Pro — Service Worker
   Estrategia: Cache-first para assets estáticos
               Network-first para CDN de Three.js
   Compatible: Chrome, Firefox, Safari 11.1+, Brave
============================================================ */

const VERSION     = 'arplan-v1.0.0';
const CACHE_CORE  = VERSION + '-core';
const CACHE_CDN   = VERSION + '-cdn';

/* Archivos propios que se cachean en la instalación */
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './workers/dxf-worker.js',
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

/* ── INSTALL: pre-cachear assets propios ─────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_CORE)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] install error:', err))
  );
});

/* ── ACTIVATE: limpiar caches viejos ────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_CORE && k !== CACHE_CDN)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: estrategia por tipo de recurso ──────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* Ignorar requests que no son GET */
  if (request.method !== 'GET') return;

  /* Ignorar requests a APIs del navegador (chrome-extension, etc.) */
  if (!url.protocol.startsWith('http')) return;

  /* Ignorar Geolocation, WebXR y otras APIs nativas — no son fetch */

  /* CDN externos: Cache-first, actualizar en background (stale-while-revalidate) */
  if (CDN_ORIGINS.some(origin => url.hostname.includes(origin))) {
    event.respondWith(staleWhileRevalidate(request, CACHE_CDN));
    return;
  }

  /* Archivos propios: Cache-first */
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, CACHE_CORE));
    return;
  }

  /* Todo lo demás: red directa */
});

/* ── Estrategias ────────────────────────────────────────── */

/**
 * Cache-first: responde desde caché si existe,
 * si no va a red y guarda el resultado.
 */
async function cacheFirst(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    /* Sin red y sin caché: devolver página offline simple */
    return offlineFallback();
  }
}

/**
 * Stale-while-revalidate: responde desde caché inmediatamente
 * y actualiza en background.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || await fetchPromise || offlineFallback();
}

/**
 * Página de fallback cuando no hay red ni caché.
 */
function offlineFallback() {
  return new Response(
    `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ARPlan Pro — Sin conexión</title>
  <style>
    body { margin:0; background:#111827; color:#f9fafb;
           font-family:-apple-system,sans-serif;
           display:flex; flex-direction:column; align-items:center;
           justify-content:center; min-height:100vh; text-align:center; padding:20px; }
    h1 { font-size:20px; font-weight:500; margin-bottom:8px; }
    p  { font-size:14px; color:#9ca3af; margin-bottom:20px; }
    button { padding:10px 24px; background:#3b82f6; color:#fff;
             border:none; border-radius:20px; font-size:14px; cursor:pointer; }
  </style>
</head>
<body>
  <h1>Sin conexión</h1>
  <p>ARPlan Pro no pudo cargar.<br>
     Verifica tu conexión o espera a que se descargue la caché.</p>
  <button onclick="location.reload()">Reintentar</button>
</body>
</html>`,
    {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    }
  );
}

/* ── Mensajes desde la app ───────────────────────────────── */
self.addEventListener('message', event => {
  if (!event.data) return;

  /* La app puede pedir forzar actualización */
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  /* La app puede pedir limpiar el caché CDN (para forzar reload de libs) */
  if (event.data.type === 'CLEAR_CDN_CACHE') {
    caches.delete(CACHE_CDN).then(() => {
      event.ports[0]?.postMessage({ ok: true });
    });
  }
});
