importScripts('./push-sw.js?v=40');

const PREFIX='ferie-facili-test-';
const CACHE=PREFIX+'20261023-push-v40';
const FILES=['./push-notifications.js?v=40','./push-sw.js?v=40','./live-detector.js?v=39','./live-camera.js?v=39','./live-camera.css?v=38','./admin-menu.js?v=34','./worker-menu.js?v=30','./install-app.js?v=30','./app-dialog.js?v=30','./pdf-scan.js?v=30','./multipage.js?v=38','./worker-guide.js?v=30','./','./index.html','./app.js?v=40','./archive.js?v=30','./auto-scan.js?v=30','./scanner-core.js?v=30','./edge-crop.js?v=30','./paper-clean.js?v=30','./upload-draft.js?v=30','./config.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url);
 if(e.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request)));
});










