importScripts('./push-sw.js?v=54');

const PREFIX='ferie-facili-test-';
const CACHE=PREFIX+'20261101-admin-shifts-v54';
const FILES=['./admin-shifts.js?v=54','./shift-core.js?v=54','./daily-presence.js?v=54','./week-changes.js?v=54','./week-changes-core.js?v=54','./week-changes.css?v=54','./camera-perspective.js?v=49','./rest-worker.js?v=48','./rest-offer-core.js?v=48','./rest-advice.js?v=47','./rest-planner.css?v=48','./rest-ui.js?v=48','./rest-core.js','./leave-core.js','./vendor/decimal.js','./notification-badge.png?v=43','./push-notifications.js?v=54','./push-sw.js?v=54','./live-detector.js?v=39','./live-camera.js?v=49','./live-camera.css?v=49','./admin-menu.js?v=34','./worker-menu.js?v=30','./install-app.js?v=30','./app-dialog.js?v=30','./pdf-scan.js?v=30','./multipage.js?v=38','./worker-guide.js?v=30','./','./index.html','./app.js?v=54','./archive.js?v=30','./auto-scan.js?v=30','./scanner-core.js?v=30','./edge-crop.js?v=30','./paper-clean.js?v=30','./upload-draft.js?v=30','./config.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url);
 if(e.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request)));
});











