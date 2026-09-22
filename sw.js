/* Groundstation — minimal offline shell service worker.
   Companion to groundstation.html. Caches the app document so the shell
   loads with no network; API/tile requests still go to the network and
   simply fail into the app's own per-panel empty states when offline. */
var CACHE = 'groundstation-shell-v2';

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      // Pre-cache each shell URL on its own: addAll() is atomic and the deploy
      // layout ships index.html without groundstation.html (and vice versa), so
      // one 404 must not empty the whole pre-cache.
      return Promise.all(['./', './index.html', './groundstation.html']
        .map(function(u){ return c.add(u).catch(function(){}); }));
    })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(ks){
      return Promise.all(ks.map(function(k){ if(k !== CACHE) return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  // Network-first for the app document, cache fallback when offline.
  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(function(res){
        try{
          if(res.ok && res.type==='basic' && new URL(req.url).origin===self.location.origin){
            var copy = res.clone();
            e.waitUntil(caches.open(CACHE).then(function(c){ return c.put(req, copy); }));
          }
        }catch(_){}
        return res;
      }).catch(function(){
        // Each caches.match() resolves to undefined on a miss, so await them in
        // turn instead of chaining with || (a Promise is always truthy).
        return caches.match(req, {ignoreSearch:true}).then(function(m){
          if(m) return m;
          return caches.match('./index.html')
            .then(function(a){ return a || caches.match('./groundstation.html'); })
            .then(function(a){ return a || caches.match('./'); });
        });
      })
    );
  }
  // Everything else (CDN libs, tiles, APIs): pass through to the network.
});
