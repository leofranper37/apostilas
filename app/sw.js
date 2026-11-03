// Service worker: deixa o app abrir rápido e funcionar mesmo sem internet
const VERSAO = 'apostilas-v4';
const BASE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(BASE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Login, banco e IA (Firebase) sempre direto da internet
  if (/(^|\.)(firestore|identitytoolkit|securetoken)\.googleapis\.com$|\.cloudfunctions\.net$|\.run\.app$|\.firebaseapp\.com$/.test(url.hostname)) return;
  // Configuração: busca a nova primeiro; sem internet, usa a guardada
  if (url.origin === location.origin && url.pathname.endsWith('/config.js')) {
    e.respondWith(
      fetch(e.request)
        .then(r => { const c = r.clone(); caches.open(VERSAO).then(x => x.put(e.request, c)); return r; })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  // Página: busca a versão nova primeiro; sem internet, usa a guardada
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(r => { const c = r.clone(); caches.open(VERSAO).then(x => x.put('./index.html', c)); return r; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  // Fontes, gerador de PDF e ícones: usa o guardado e atualiza quando der
  e.respondWith(
    caches.match(e.request).then(m => m || fetch(e.request).then(r => {
      if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(VERSAO).then(x => x.put(e.request, c)); }
      return r;
    }))
  );
});
