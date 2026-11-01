// Only the TEST service worker handles these daily-presence links.
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 const daily=data.type==='test-daily-presence'&&/^\d{4}-\d{2}-\d{2}$/.test(data.day||'');
 const notice=daily?{day:data.day,mode:data.mode==='week'?'week':'day',noticeId:data.noticeId}:null;
 event.waitUntil(Promise.all([self.registration.showNotification(daily?String(data.title).slice(0,100):'Lavoro Facile · TEST',{body:daily?String(data.body).slice(0,300):'Hai un aggiornamento o un promemoria. Apri l’app per consultarlo.',icon:new URL('./icon-192.png',self.registration.scope).href,badge:new URL('./notification-badge.png?v=43',self.registration.scope).href,tag:daily?'test-presence-'+data.day:'lavoro-facile-test',data:notice,silent:false}),self.clients.matchAll({type:'window'}).then(clients=>clients.forEach(c=>c.postMessage({type:'TEST_DAILY_NOTICE_RECEIVED'})))]));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const target=self.registration.scope,notice=event.notification.data;
 event.waitUntil((async()=>{
  const existing=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).find(c=>c.url.startsWith(target));
  if(existing){if(notice?.day)existing.postMessage({type:'OPEN_TEST_DAILY_PRESENCE',...notice});return existing.focus();}
  const url=new URL(target);if(notice?.day){url.searchParams.set('presenze',notice.day);url.searchParams.set('vista',notice.mode==='week'?'week':'day');}return self.clients.openWindow(url.href);
 })());
});
