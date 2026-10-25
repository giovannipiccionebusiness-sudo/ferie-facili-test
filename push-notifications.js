import {SUPABASE_URL,SUPABASE_ANON_KEY} from './config.js';
const OWNER='lavoro-facile-test-push-owner';
export function createPushControls({getSession}){
 const panel=document.createElement('section');panel.className='push-settings';panel.innerHTML='<h3>🔔 Notifiche sul telefono · TEST</h3><p>Avvisi sull’abilitazione e promemoria delle presenze mancanti. Nessun dato dei documenti compare nella notifica.</p><p class="push-status" role="status"></p><div class="doc-toolbar"><button type="button" class="doc-button">Attiva notifiche</button><button type="button" class="doc-button outline">Invia notifica di prova</button><button type="button" class="doc-button outline">Disattiva notifiche</button></div>';
 document.getElementById('loggedArea').append(panel);const status=panel.querySelector('[role=status]'),[enable,test,disable]=panel.querySelectorAll('button');let busy=false;
 const supported=()=>!!window.Notification&&!!navigator.serviceWorker&&'PushManager' in window;
 const ios=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 async function api(action,endpoint){const session=getSession();if(!session)throw Error('Accedi per gestire le notifiche.');const response=await fetch(SUPABASE_URL+'/functions/v1/test-web-push',{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+session.access_token},body:JSON.stringify({action,endpoint}),signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Servizio notifiche non disponibile.');return data;}
 async function registration(){return Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Aggiornamento dell’app in corso. Chiudi e riapri, poi riprova.')),12000))]);}
 function owner(){try{return localStorage.getItem(OWNER);}catch{return null;}}
 function setOwner(id){try{if(id)localStorage.setItem(OWNER,id);else localStorage.removeItem(OWNER);}catch{}}
 async function current(){if(!supported())return null;return (await registration()).pushManager.getSubscription();}
 async function refresh(){
  if(busy)return;panel.hidden=!getSession();if(panel.hidden)return;
  enable.hidden=test.hidden=disable.hidden=true;
  if(ios()&&!standalone()){status.textContent='Su iPhone/iPad: apri in Safari, premi Condividi → Aggiungi alla schermata Home. Apri poi l’app dall’icona. Richiede iOS/iPadOS 16.4 o successivo.';return;}
  if(!supported()){status.textContent='Questo browser non supporta le notifiche push. Usa un browser aggiornato.';return;}
  try{const sub=await current();const active=!!sub&&owner()===getSession()?.user.id&&Notification.permission==='granted';enable.hidden=active;test.hidden=disable.hidden=!active;enable.disabled=Notification.permission==='denied';status.textContent=Notification.permission==='denied'?'Notifiche bloccate. Consenti le notifiche nelle impostazioni del browser o del telefono.':active?'Notifiche attive su questo dispositivo. Venerdì alle 17:00 e ultimo giorno del mese alle 18:00, solo se manca il foglio.':'Puoi attivare gli avvisi anche mentre attendi l’abilitazione del responsabile.';}
  catch(e){status.textContent=e.message;enable.hidden=false;}
 }
 async function run(task){if(busy)return;busy=true;for(const b of [enable,test,disable])b.disabled=true;try{await task();}catch(e){status.textContent=e.message;}finally{busy=false;for(const b of [enable,test,disable])b.disabled=false;}}
 enable.onclick=()=>run(async()=>{
  const user=getSession()?.user.id;if(!user)return;
  const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Notifiche non attivate. Puoi consentirle in seguito dalle impostazioni del browser.');
  status.textContent='Attivazione in corso…';const {publicKey}=await api('key'),reg=await registration();let sub=await reg.pushManager.getSubscription();
  if(sub&&owner()!==user){await sub.unsubscribe();sub=null;}
  const fresh=!sub;if(!sub){const padded=publicKey.replaceAll('-','+').replaceAll('_','/');const key=Uint8Array.from(atob(padded+'='.repeat((4-padded.length%4)%4)),c=>c.charCodeAt(0));sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});}
  try{if(getSession()?.user.id!==user)throw Error('Account cambiato. Riprova.');await api('subscribe',sub.endpoint);setOwner(user);}catch(e){if(fresh)await sub.unsubscribe();throw e;}
  busy=false;await refresh();busy=true;status.textContent='Notifiche attivate. Premi “Invia notifica di prova” per controllare la ricezione.';
 });
 test.onclick=()=>run(async()=>{const sub=await current();if(!sub)throw Error('Attiva prima le notifiche.');await api('test',sub.endpoint);status.textContent='Notifica di prova inviata. Controlla il centro notifiche del telefono.';});
 async function deactivate(){if(!supported())return;const registrationNow=await navigator.serviceWorker.getRegistration('./');if(!registrationNow)return;const sub=await registrationNow.pushManager.getSubscription();let error=null;if(sub){await sub.unsubscribe();try{if(getSession()&&owner()===getSession().user.id)await api('unsubscribe',sub.endpoint);}catch(e){error=e;}}setOwner(null);const reg=await registration();for(const n of await reg.getNotifications())n.close();if(error)throw Error('Notifiche disattivate sul telefono. La pulizia sul server sarà completata automaticamente.');}
 disable.onclick=()=>run(async()=>{await deactivate();busy=false;await refresh();busy=true;status.textContent='Notifiche disattivate su questo dispositivo.';});
 return {refresh,beforeLogout:async()=>{try{await Promise.race([deactivate(),new Promise(r=>setTimeout(r,2000))]);}catch{/* Logout must still complete; invalid endpoints expire on the push service. */}}};
}
