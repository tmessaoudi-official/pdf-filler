const CACHE = 'pdfapp-v1';
const SHELL = [
  './',
  './js/main.js?v=7',
  './js/pdfEditorApp.js?v=7',
  './js/pdfRenderer.js?v=7',
  './js/pdfElement.js?v=7',
  './js/textElement.js?v=7',
  './js/signatureElement.js?v=7',
  './js/signaturePad.js?v=7',
  './js/interactionHandler.js?v=7',
  './js/shapeElement.js?v=7',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Only cache same-origin requests; let CDN (pdf.js, pdf-lib) go direct
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      });
    })
  );
});
