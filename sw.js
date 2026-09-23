/* Groundstation — offline shell + library service worker.
   Companion to groundstation.html / index.html.
   - Shell (the app document): network-first, cached copy when offline.
   - Libraries (MapLibre, satellite.js, SunCalc, Cesium + its workers/assets
     from cdnjs or jsdelivr): cache-first. Versions are pinned in the URLs, so a
     cached copy is never stale. Pre-fetched at install so the 3D globe works
     offline even if it was never opened online.
   - APIs and tiles: network only; the app has per-panel empty states. */
var SHELL = 'groundstation-shell-v3';
var LIBS  = 'groundstation-libs-v1';
var CDN_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];
var PRECACHE_LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/5.12.0/maplibre-gl.js',
  'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/5.12.0/maplibre-gl.css',
  'https://cdnjs.cloudflare.com/ajax/libs/satellite.js/5.0.0/satellite.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/suncalc/1.9.0/suncalc.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/cesium/1.133.1/Cesium.js',
  'https://cdnjs.cloudflare.com/ajax/libs/cesium/1.133.1/Widgets/widgets.css'
];

function isCdn(url){
  try{ return CDN_HOSTS.indexOf(new URL(url).hostname) !== -1; }catch(_){ return false; }
}

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(Promise.all([
    caches.open(SHELL).then(function(c){
      // Each shell URL on its own: addAll() is atomic and the deploy layout ships
      // index.html without groundstation.html (and vice versa).
      return Promise.all(['./', './index.html', './groundstation.html']
        .map(function(u){ return c.add(u).catch(function(){}); }));
    }),
    caches.open(LIBS).then(function(c){
      return Promise.all(PRECACHE_LIBS.map(function(u){
        return c.match(u).then(function(m){
          if(m) return;
          return fetch(new Request(u, {mode:'cors'})).then(function(res){
            if(res && res.ok) return c.put(u, res);
          }).catch(function(){});
        });
      }));
    })
  ]));
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(ks){
      return Promise.all(ks.map(function(k){ if(k !== SHELL && k !== LIBS) return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;

  // Libraries: cache-first, then network (and remember it).
  if(isCdn(req.url)){
    e.respondWith(
      caches.open(LIBS).then(function(c){
        return c.match(req.url).then(function(m){
          if(m) return m;
          return fetch(req).then(function(res){
            if(res && res.ok && res.type !== 'opaque'){
              var copy = res.clone();
              e.waitUntil(c.put(req.url, copy));
            }
            return res;
          });
        });
      })
    );
    return;
  }

  // The app document: network-first, cache fallback when offline.
  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(function(res){
        try{
          if(res.ok && res.type==='basic' && new URL(req.url).origin===self.location.origin){
            var copy = res.clone();
            e.waitUntil(caches.open(SHELL).then(function(c){ return c.put(req, copy); }));
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
  // Everything else (tiles, APIs): pass through to the network.
});
