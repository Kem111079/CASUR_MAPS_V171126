/* CASUR Maps · service worker.
   - Aplicación: se sirve desde caché al instante y se refresca en segundo plano.
   - data/: no se toca aquí; la app administra su propia copia y solo descarga cuando cambia la versión.
   - Mapa base: caché aparte con tope, para que nunca desplace a los polígonos. */
const VERSION = 'v271126h';
const SHELL = 'casur-maps-shell-' + VERSION;
const TILES = 'casur-tiles-v1';
const TILES_MAX = 2500;
const CORE = ['./', './index.html', './styles.css', './manifest.json', './offline.html',
  './js/core.js', './js/map.js', './js/gps.js', './js/field.js',
  './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css',
  './assets/logo_casur.png', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png', './icons/favicon-32.png'];

self.addEventListener('install', e => e.waitUntil((async () => {
  const c = await caches.open(SHELL);
  await Promise.allSettled(CORE.map(u => c.add(new Request(u, {cache: 'reload'}))));
  await self.skipWaiting();
})()));
self.addEventListener('activate', e => e.waitUntil((async () => {
  const keys = await caches.keys();
  // Solo se borran cachés de versiones anteriores de CASUR Maps; no las de datos, mapas ni CASUR Suertes.
  await Promise.all(keys.filter(k => k.startsWith('casur-maps-') && k !== SHELL).map(k => caches.delete(k)));
  await self.clients.claim();
})()));

let _podas = 0;
async function podarTiles() {
  if (++_podas % 60) return;
  const c = await caches.open(TILES), keys = await c.keys();
  if (keys.length > TILES_MAX) await Promise.all(keys.slice(0, keys.length - TILES_MAX).map(k => c.delete(k)));
}
const esTile = u => /tile\.openstreetmap\.org$/.test(u.hostname) || u.hostname === 'server.arcgisonline.com';

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (esTile(url)) {
    e.respondWith((async () => {
      const c = await caches.open(TILES), hit = await c.match(req.url);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) { c.put(req.url, r.clone()); podarTiles(); }
      return r;
    })());
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/data/') || url.pathname.includes('/fuentes/') || url.pathname.includes('/casur_suertes_operativo/')) return;
  e.respondWith((async () => {
    const c = await caches.open(SHELL), hit = await c.match(req, {ignoreSearch: true});
    const red = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    if (hit) { e.waitUntil(red); return hit; }
    return (await red) || (req.mode === 'navigate' ? (await c.match('./offline.html')) : Response.error());
  })());
});
