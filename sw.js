/* Groundstation — minimal offline shell service worker.
   Companion to groundstation.html. Caches the app document so the shell
   loads with no network; API/tile requests still go to the network and
   simply fail into the app's own per-panel empty states when offline. */
var CACHE = 'groundstation-shell-v1';

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      // cache the app shell; ignore if the exact path 404s in some deploy layout
      return c.addAll(['./', './groundstation.html']).catch(function(){});
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
            var copy = res.clone(); caches.open(CACHE).then(function(c){ c.put(req, copy); });
          }
        }catch(_){}
        return res;
      }).catch(function(){
        return caches.match(req).then(function(m){
          return m || caches.match('./groundstation.html') || caches.match('./');
        });
      })
    );
  }
  // Everything else (CDN libs, tiles, APIs): pass through to the network.
});
