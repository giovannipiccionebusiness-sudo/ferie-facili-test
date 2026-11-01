import {localToday,calendarWeek} from './week-changes-core.js?v=54';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const btn=(text,fn,outline=false)=>{const b=el('button',text,'doc-button'+(outline?' outline':''));b.type='button';b.onclick=fn;return b;};
export function createDailyPresence({getClient,getSession,getProfile,weekChanges,onError=()=>{}}){
 let panel=null,bell=null,inbox=null,user=null,epoch=0,notes=[],loading=false,pending=null,opening=false;
 const allowed=()=>!!getSession()&&getProfile()?.active&&getProfile().role==='worker';
 function clear(){epoch++;user=null;panel?.remove();panel=null;bell?.remove();bell=null;inbox?.close();inbox=null;notes=[];loading=false;}
 async function openTarget(day,mode='day',id=null){
  if(!allowed()){pending={day,mode,id};return;}if(opening)return;opening=true;const owner=getSession().user.id;
  try{calendarWeek(day);inbox?.close();await (mode==='week'?weekChanges.openWeek(day):weekChanges.openDay(day));if(id&&owner===getSession()?.user.id){const r=await getClient().rpc('read_test_daily_notice',{p_id:id});if(r.error)throw r.error;}await refresh();}catch(e){onError(e);}finally{opening=false;}
 }
 function deepLink(){const q=new URL(location.href);if(!q.searchParams.has('presenze'))return;const day=q.searchParams.get('presenze'),mode=q.searchParams.get('vista')==='week'?'week':'day';try{calendarWeek(day);pending={day,mode,id:null};}catch{}q.searchParams.delete('presenze');q.searchParams.delete('vista');history.replaceState(null,'',q);}
 if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='OPEN_TEST_DAILY_PRESENCE'){const {day,mode,noticeId}=e.data;try{calendarWeek(day);pending={day,mode:mode==='week'?'week':'day',id:noticeId};if(allowed()){const target=pending;pending=null;openTarget(target.day,target.mode,target.id);}}catch{}}else if(e.data?.type==='TEST_DAILY_NOTICE_RECEIVED')refresh();});
 deepLink();
 function showInbox(){
  inbox?.close();const d=el('dialog',null,'wc-dialog dp-inbox'),header=el('header',null,'wc-head'),close=btn('×',()=>d.close(),true);close.className='wc-close';close.setAttribute('aria-label','Chiudi notifiche');header.append(close,el('h2','🔔 Promemoria presenze · prova'));const body=el('div',null,'wc-body');body.append(el('p','Tocca un avviso per aprire il giorno o il riepilogo della settimana.','wc-intro'));
  if(!notes.length)body.append(el('p','Non hai ancora promemoria di prova. Puoi compilare la giornata dalla Home.'));
  for(const n of notes){const b=btn((n.read_at?'✓ ':'● ')+(n.kind==='week'?'Controlla la tua settimana':'Aggiorna le presenze')+' · '+n.day.split('-').reverse().join('/'),()=>openTarget(n.day,n.kind,n.id),true);b.classList.add('dp-notice');body.append(b);}
  body.append(btn('Aggiorna avvisi',async()=>{await refresh();if(inbox===d)showInbox();},true));d.append(header,body);d.addEventListener('close',()=>d.remove());document.body.append(d);inbox=d;d.showModal();
 }
 async function refresh(){
  if(!allowed()){clear();return;}if(loading)return;loading=true;const owner=getSession().user.id,token=epoch;
  try{
   const [nr,dr]=await Promise.all([getClient().from('test_daily_notices').select('*').eq('worker_id',owner).order('created_at',{ascending:false}).limit(30),getClient().from('test_daily_presence').select('*').eq('worker_id',owner).eq('day',localToday()).maybeSingle()]);if(nr.error||dr.error)throw nr.error||dr.error;if(token!==epoch||owner!==getSession()?.user.id||!allowed())return;
   user=owner;notes=nr.data||[];if(!bell){bell=btn('',showInbox);bell.className='dp-bell';document.body.append(bell);}const unread=notes.filter(n=>!n.read_at).length;bell.textContent='🔔'+(unread?' '+unread:'');bell.setAttribute('aria-label','Apri promemoria presenze di prova'+(unread?', '+unread+' da leggere':''));
   if(panel){panel.querySelector('.dp-today-state').textContent=dr.data?'✓ Oggi già compilato · puoi correggerlo':'Puoi salvare anche prima di caricare il foglio.';panel.querySelector('input[type=date]').max=localToday();return;}panel=el('section',null,'card dp-panel');panel.append(el('h3','📝 Le presenze, giorno per giorno'),el('p','Indica ore in più e assenze: il venerdì le ritrovi già compilate.','wc-intro'));
   const status=el('p',dr.data?'✓ Oggi già compilato · puoi correggerlo':'Puoi salvare anche prima di caricare il foglio.','dp-today-state'),dayLabel=el('label','Giorno da compilare'),dayInput=el('input');dayInput.type='date';dayInput.value=localToday();dayInput.max=localToday();dayInput.className='doc-input';dayInput.setAttribute('aria-label','Giorno da compilare');dayLabel.append(dayInput);const actions=el('div',null,'doc-toolbar');actions.append(btn('Compila giornata',()=>openTarget(dayInput.value)),btn('Riepilogo settimana',()=>openTarget(dayInput.value,'week'),true));panel.append(status,dayLabel,actions);
   panel.append(el('small','Il promemoria è impostato dal responsabile: arriva 30 minuti prima della fine dell’ultima fascia di lavoro. Per riceverlo sul telefono, consenti gli avvisi dell’app.'));document.getElementById('workerArea').prepend(panel);
  }catch(e){onError(e);}finally{loading=false;if(pending&&allowed()){const target=pending;pending=null;openTarget(target.day,target.mode,target.id);}}
 }
 function invalidate(){panel?.remove();panel=null;return refresh();}
 const timer=setInterval(()=>{if(allowed()&&document.visibilityState==='visible')refresh();},60000);window.addEventListener('focus',()=>{if(allowed())refresh();});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&allowed())refresh();});
 return {refresh,clear,invalidate};
}
