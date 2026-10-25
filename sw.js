// Guarda só os arquivos do app, para abrir rápido mesmo com sinal fraco.
// Streams e a API de rádios sempre vão direto para a rede.
const CACHE = 'radio-br-v6';
const FILES = [
  './',
  'index.html',
  'styles.css?v=6',
  'stations.js?v=6',
  'app.js?v=6',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Rede primeiro, sempre conferindo com o servidor (o GitHub Pages manda
  // cache de 10 min, o que misturava versão nova e antiga dos arquivos).
  // Sem internet, usa o que estiver guardado.
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
