const CACHE="pulso90-shell-v2";
const CORE=["./","media-kit.html","games/","games/providers.html","games/fairness.html","games/certification.html","catalog/","providers/","insights.html","site.webmanifest","icon.svg"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE).catch(()=>{})));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET"||u.pathname.startsWith("/api/"))return;
  if(/\/(runtime-config|release|spa-status|partners)\.json$/.test(u.pathname)||u.pathname.includes("/data/")){e.respondWith(fetch(e.request,{cache:"no-store"}));return}
  if(e.request.mode==="navigate"){
    e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match("./"))));
    return;
  }
  if(u.origin===location.origin){
    e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r})));
  }
});