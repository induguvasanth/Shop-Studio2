const CACHE="shop-studio-clean-v32.0.0";
const CORE=["./","./index.html","./styles.css","./app-v11.9.9.js","./app-v11.5.0.js","./smart-card-patch.js","./scanner-connect.js","./advanced-pdf-studio.js","./app-v11.6.0.js","./app-v11.7.0.js","./app-v11.8.0.js","./manifest.webmanifest","./assets/icon.svg"];
const RUNTIME_ORIGINS=[
  "https://cdn.jsdelivr.net",
  "https://cdnjs.cloudflare.com",
  "https://docs.opencv.org",
  "https://esm.sh",
  "https://staticimgly.com"
];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  const sameOrigin=u.origin===location.origin;
  const runtime=RUNTIME_ORIGINS.includes(u.origin);
  if(!sameOrigin&&!runtime)return;
  e.respondWith(
    caches.match(e.request).then(cached=>{
      const network=fetch(e.request).then(r=>{
        if(r&&r.ok||r.type==='opaque'){
          const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
        }
        return r;
      }).catch(()=>cached||Response.error());
      return cached||network;
    })
  );
});
