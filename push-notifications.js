import {SUPABASE_URL,SUPABASE_ANON_KEY} from './config.js';
const OWNER='lavoro-facile-test-push-owner';
export function createPushControls({getSession}){
 const panel=document.createElement('section');panel.className='push-settings';panel.innerHTML='<h3>🔔 Vuoi un promemoria per le presenze?</h3><p class="push-intro">Ti avvisiamo quando manca il foglio e quando il tuo account viene abilitato. I dati dei documenti restano dentro l’app.</p><p class="push-status" role="status"></p><div class="doc-toolbar"><button type="button" class="doc-button">Sì, attiva gli avvisi</button><button type="button" class="doc-button outline">Non ora</button><button type="button" class="doc-button outline">Invia notifica di prova</button><button type="button" class="doc-button outline">Disattiva notifiche</button></div><details class="push-help"><summary>Mostrami come fare</summary><div class="push-help-content"></div></details>';
 document.getElementById('loggedArea').append(panel);const status=panel.querySelector('[role=status]'),heading=panel.querySelector('h3'),intro=panel.querySelector('.push-intro'),[enable,later,test,disable]=panel.querySelectorAll('button'),help=panel.querySelector('.push-help'),helpContent=panel.querySelector('.push-help-content');let busy=false;
 const supported=()=>!!window.Notification&&!!navigator.serviceWorker&&'PushManager' in window;
 const ios=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const postponed=()=>{try{return sessionStorage.getItem(OWNER+'-later')===getSession()?.user.id;}catch{return false;}};
 function postpone(value){try{if(value)sessionStorage.setItem(OWNER+'-later',getSession()?.user.id||'');else sessionStorage.removeItem(OWNER+'-later');}catch{}}
 function guide(install=false){
  const chrome=/Chrome|CriOS/.test(navigator.userAgent),android=/Android/.test(navigator.userAgent);
  const steps=install?[
   ['↗','Apri questa pagina in Safari','Premi Condividi: è il simbolo del quadrato con la freccia verso l’alto.'],
   ['＋','Aggiungi alla schermata Home','Conferma con Aggiungi. Troverai l’icona di Lavoro Facile sul telefono.'],
   ['🔔','Apri l’app dalla nuova icona','Accedi, premi “Sì, attiva gli avvisi” e poi “Consenti”. Richiede iOS/iPadOS 16.4 o successivo.']
  ]:ios()?[
   ['⚙','Apri le Impostazioni del telefono','Cerca Notifiche, quindi Lavoro Facile (la versione di test).'],
   ['🔔','Attiva Consenti notifiche','Se l’app non compare, aprila dalla schermata Home e riprova.'],
   ['✓','Torna qui e riprova','Premi “Ho fatto, ricontrolla”.']
  ]:[
   ['☷','Tocca il simbolo a sinistra dell’indirizzo',chrome?'In Chrome è il simbolo con i cursori, accanto al nome del sito. Se sei nell’app installata, apri prima la pagina in Chrome.':'Apri le informazioni o le autorizzazioni del sito nel browser.'],
   ['🔔','Scegli Autorizzazioni → Notifiche','Seleziona Consenti. Il nome delle voci può variare in base al telefono.'],
   ['✓','Torna qui e riprova','Premi “Ho fatto, ricontrolla”.'+(android?' Se sono ancora bloccate: Impostazioni del telefono → App → '+(chrome?'Chrome':'il tuo browser')+' → Notifiche.':'')]
  ];
  helpContent.replaceChildren();const explanation=document.createElement('p');explanation.textContent=install?'Su iPhone devi prima aggiungere l’app alla schermata Home.':'Il telefono ha già bloccato gli avvisi: serve questo passaggio una sola volta. L’app non può cambiare il permesso al posto tuo.';helpContent.append(explanation);
  const list=document.createElement('ol');for(const [icon,title,description] of steps){const li=document.createElement('li'),symbol=document.createElement('span'),copy=document.createElement('div'),strong=document.createElement('strong'),text=document.createElement('p');symbol.className='push-step-icon';symbol.setAttribute('aria-hidden','true');symbol.textContent=icon;strong.textContent=title;text.textContent=description;copy.append(strong,text);li.append(symbol,copy);list.append(li);}helpContent.append(list);
  const recheck=document.createElement('button');recheck.type='button';recheck.className='doc-button outline';recheck.textContent='Ho fatto, ricontrolla';recheck.onclick=()=>{postpone(false);refresh();};helpContent.append(recheck);
 }
 async function api(action,endpoint){const session=getSession();if(!session)throw Error('Accedi per gestire le notifiche.');const response=await fetch(SUPABASE_URL+'/functions/v1/test-web-push',{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+session.access_token},body:JSON.stringify({action,endpoint}),signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Servizio notifiche non disponibile.');return data;}
 async function registration(){return Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Aggiornamento dell’app in corso. Chiudi e riapri, poi riprova.')),12000))]);}
 function owner(){try{return localStorage.getItem(OWNER);}catch{return null;}}
 function setOwner(id){try{if(id)localStorage.setItem(OWNER,id);else localStorage.removeItem(OWNER);}catch{}}
 async function current(){if(!supported())return null;return (await registration()).pushManager.getSubscription();}
 async function refresh(){
  if(busy)return;panel.hidden=!getSession();if(panel.hidden)return;
  enable.hidden=later.hidden=test.hidden=disable.hidden=true;help.hidden=true;heading.textContent='🔔 Vuoi un promemoria per le presenze?';intro.hidden=false;
  if(ios()&&!standalone()){status.textContent=postponed()?'Va bene, puoi continuare a usare l’app e attivare gli avvisi quando vuoi.':'Bastano tre passaggi per preparare il tuo iPhone.';intro.hidden=postponed();enable.hidden=false;later.hidden=postponed();enable.textContent='Mostrami i passaggi';guide(true);help.hidden=false;return;}
  if(!supported()){status.textContent='Puoi continuare a usare l’app. Per gli avvisi serve un browser aggiornato che supporti le notifiche.';return;}
  try{const sub=await current();if(!getSession())return;const active=!!sub&&owner()===getSession().user.id&&Notification.permission==='granted',blocked=Notification.permission==='denied';enable.hidden=active;later.hidden=active||postponed();test.hidden=disable.hidden=!active;enable.disabled=false;enable.textContent=blocked?'Mostrami come attivarli':postponed()?'Attiva gli avvisi':'Sì, attiva gli avvisi';help.hidden=active||!blocked;if(blocked)guide();if(active){heading.textContent='🔔 Gli avvisi sono attivi';intro.hidden=true;help.open=false;}else if(postponed()){heading.textContent='🔔 Avvisi sul telefono';intro.hidden=true;}status.textContent=active?'Ti ricordiamo le presenze mancanti il venerdì alle 17:00 e a fine mese alle 18:00.':postponed()?'Va bene, puoi continuare a usare l’app e attivare gli avvisi quando vuoi.':blocked?'Gli avvisi sono bloccati sul telefono. Ti accompagniamo passo passo per riattivarli.':'Premi “Sì, attiva gli avvisi”, poi scegli “Consenti” nella richiesta del telefono.';}
  catch(e){status.textContent=e.message;enable.hidden=false;}
 }
 async function run(task){if(busy)return;busy=true;for(const b of [enable,later,test,disable])b.disabled=true;try{await task();}catch(e){status.textContent=e.message;}finally{busy=false;for(const b of [enable,later,test,disable])b.disabled=false;}}
 later.onclick=()=>{postpone(true);help.open=false;refresh();};
 enable.onclick=()=>{
  if((ios()&&!standalone())||(supported()&&Notification.permission==='denied')){guide(ios()&&!standalone());help.hidden=false;help.open=true;help.scrollIntoView({behavior:'smooth',block:'nearest'});return;}
  return run(async()=>{
  const user=getSession()?.user.id;if(!user)return;
  const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();if(permission!=='granted'){if(permission==='denied'){guide();help.hidden=false;help.open=true;enable.textContent='Mostrami come attivarli';status.textContent='Gli avvisi sono bloccati. Segui i passaggi qui sotto per riattivarli.';}else{status.textContent='Nessun problema: puoi usare l’app e attivare gli avvisi più avanti. Quando riprovi, scegli “Consenti” nella richiesta del telefono.';}return;}
  postpone(false);
  status.textContent='Attivazione in corso…';const {publicKey}=await api('key'),reg=await registration();let sub=await reg.pushManager.getSubscription();
  if(sub&&owner()!==user){await sub.unsubscribe();sub=null;}
  const fresh=!sub;if(!sub){const padded=publicKey.replaceAll('-','+').replaceAll('_','/');const key=Uint8Array.from(atob(padded+'='.repeat((4-padded.length%4)%4)),c=>c.charCodeAt(0));sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});}
  try{if(getSession()?.user.id!==user)throw Error('Account cambiato. Riprova.');await api('subscribe',sub.endpoint);setOwner(user);}catch(e){if(fresh)await sub.unsubscribe();throw e;}
  busy=false;await refresh();busy=true;status.textContent='Notifiche attivate. Premi “Invia notifica di prova” per controllare la ricezione.';
 });};
 test.onclick=()=>run(async()=>{const sub=await current();if(!sub)throw Error('Attiva prima le notifiche.');await api('test',sub.endpoint);status.textContent='Notifica di prova inviata. Controlla il centro notifiche del telefono.';});
 async function deactivate(){if(!supported())return;const registrationNow=await navigator.serviceWorker.getRegistration('./');if(!registrationNow)return;const sub=await registrationNow.pushManager.getSubscription();let error=null;if(sub){await sub.unsubscribe();try{if(getSession()&&owner()===getSession().user.id)await api('unsubscribe',sub.endpoint);}catch(e){error=e;}}setOwner(null);const reg=await registration();for(const n of await reg.getNotifications())n.close();if(error)throw Error('Notifiche disattivate sul telefono. La pulizia sul server sarà completata automaticamente.');}
 disable.onclick=()=>run(async()=>{await deactivate();busy=false;await refresh();busy=true;status.textContent='Notifiche disattivate su questo dispositivo.';});
 return {refresh,beforeLogout:async()=>{try{await Promise.race([deactivate(),new Promise(r=>setTimeout(r,2000))]);}catch{/* Logout must still complete; invalid endpoints expire on the push service. */}}};
}
