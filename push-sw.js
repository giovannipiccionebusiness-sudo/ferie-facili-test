// Test scope only. Generic content avoids exposing worker or document details.
self.addEventListener('push',event=>{
 event.waitUntil(self.registration.showNotification('Lavoro Facile · TEST',{body:'Hai un aggiornamento o un promemoria. Apri l’app per consultarlo.',icon:new URL('./icon-192.png',self.registration.scope).href,badge:new URL('./icon-192.png',self.registration.scope).href,tag:'lavoro-facile-test',data:{url:self.registration.scope}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const target=self.registration.scope;
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{const existing=clients.find(c=>c.url.startsWith(target));if(existing){await existing.navigate(target);return existing.focus();}return self.clients.openWindow(target);}));
});
