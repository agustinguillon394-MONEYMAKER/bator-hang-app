// Primero la red (para que siempre llegue lo nuevo); sin señal, lo guardado.
var CACHE = 'bator-hang-202611011924';
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('fetch', function(e){
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(function(r){
    var copia = r.clone();
    caches.open(CACHE).then(function(c){ c.put(e.request, copia); });
    return r;
  }).catch(function(){ return caches.match(e.request, {ignoreSearch: u.pathname.slice(-1) === '/' || u.pathname.endsWith('index.html')}); }));
});
