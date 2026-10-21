import {saveUploadDraft,readUploadDraft,deleteUploadDraft} from './upload-draft.js?v=9';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.10';
import {SUPABASE_URL,SUPABASE_ANON_KEY} from './config.js';
const $=id=>document.getElementById(id);
const configured=SUPABASE_URL.startsWith('https://')&&SUPABASE_ANON_KEY.length>20;
let authClient=null,sb=null,profile=null,session=null,docs=[],people=[],missing=[];
const safe=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel=s=>new Date(s).toLocaleString('it-IT');
const typeLabel={presenze:'Foglio presenze',ferie:'Ferie',rol:'ROL',legge104:'Legge 104',malattia:'Malattia'};
const stageLabel={weekly:'Aggiornamento settimanale',replacement:'Sostituzione settimanale',final:'Definitivo mensile',request:'Modulo firmato'};
const statusLabel={pending:'In verifica',verified:'Documento verificato',rejected:'Documento respinto'};
const isoLocalDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const monthNow=()=>isoLocalDate(new Date()).slice(0,7);
$('month').value=monthNow();$('adminMonth').value=monthNow();
const today=new Date(), friday=new Date(today);friday.setDate(today.getDate()+((5-today.getDay()+7)%7));$('weekDate').value=isoLocalDate(friday);$('workerWeek').value=$('weekDate').value;
function msg(t){$('appMsg').textContent=t}
function err(e){msg(e?.message||String(e))}
function node(tag,text,cls){const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;return el}
function button(label,cb,outline=false){const b=node('button',label,'doc-button'+(outline?' outline':''));b.type='button';b.onclick=cb;return b}
function showLogged(on){$('authArea').classList.toggle('hidden',on);$('loggedArea').classList.toggle('hidden',!on);$('workerArea').classList.toggle('hidden',!on||!profile?.active||profile.role==='admin');$('adminArea').classList.toggle('hidden',!on||!profile?.active||profile.role!=='admin')}
async function boot(){if(!configured){$('setupAlert').textContent='Configurazione mancante: apri INSTALLAZIONE.md. I documenti NON vengono inviati.';showLogged(false);$('loginBtn').disabled=true;$('signupBtn').disabled=true;return}
 authClient=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
 sb=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{accessToken:async()=>session?.access_token??null,global:{fetch:async(input,init={})=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),String(input?.url||input).includes('/storage/v1/')?120000:20000);try{return await fetch(input,{...init,signal:controller.signal})}finally{clearTimeout(timer)}}}});$('setupAlert').classList.add('hidden');
 authClient.auth.onAuthStateChange((event,s)=>{session=s;if(event==='SIGNED_OUT'){profile=null;showLogged(false);msg('Accesso terminato.')}});
 const {data,error}=await authClient.auth.getSession();if(error)throw error;session=data.session;await reloadAccount();
}
async function reloadAccount(){profile=null;if(session){const {data,error}=await sb.from('profiles').select('*').eq('id',session.user.id).single();if(error){err(error);showLogged(false);return}profile=data;$('accountName').textContent=profile.full_name||session.user.email;$('accountInfo').textContent=profile.active?(profile.role==='admin'?'Amministratore':profile.site||'Sede da assegnare'):'In attesa di abilitazione';}showLogged(!!session);if(!session){msg('Accedi o richiedi la registrazione.');return}if(!profile.active){msg('Registrazione ricevuta. L’amministratore deve abilitare il tuo account.');return}msg('Accesso effettuato.');if(profile.role==='admin')await refreshAdmin();else {await restoreUploadState();}}
$('loginBtn').onclick=async()=>{
 const b=$('loginBtn');if(!sb){msg('Connessione in preparazione. Riprova tra qualche secondo.');return}
 const email=$('email').value.trim(),password=$('password').value;
 if(!email||!password){msg('Inserisci email e password.');return}
 b.disabled=true;b.textContent='Accesso in corso…';msg('Verifica delle credenziali…');
 try{
  const {data,error}=await authClient.auth.signInWithPassword({email,password});
  if(error)throw error;
  if(!data.session)throw new Error('Sessione non ricevuta. Riprova ad accedere.');
  session=data.session;msg('Accesso riuscito. Caricamento del pannello…');
  await reloadAccount();$('password').value='';
  if(profile?.active)(profile.role==='admin'?$('adminArea'):$('workerArea')).scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){err(e)}finally{b.disabled=false;b.textContent='Accedi'}
};
$('signupBtn').onclick=async()=>{const email=$('email').value.trim(),password=$('password').value;if(!email||password.length<8){msg('Inserisci email e password di almeno 8 caratteri.');return}const full_name=prompt('Inserisci nome e cognome completi:');if(!full_name?.trim())return;const {error}=await authClient.auth.signUp({email,password,options:{data:{full_name:full_name.trim()}}});if(error)err(error);else msg('Registrazione richiesta. Controlla la tua email per confermarla, poi attendi l’abilitazione.')};
$('logoutBtn').onclick=async()=>{if(uploading){msg('Attendi la fine del caricamento prima di uscire.');return;}clearCameraSelection();if(session?.user?.id)await deleteUploadDraft(session.user.id).catch(()=>{});pendingDraft=null;recoveryPanel?.remove();recoveryPanel=null;await authClient.auth.signOut();};
$('month').onchange=refreshWorker;

let selectedUpload=null,uploading=false;

const CAMERA_KEY='ferie-facili-test-camera-selection';
let pendingDraft=null,recoveryPanel=null;
function clearCameraSelection(){try{sessionStorage.removeItem(CAMERA_KEY);}catch{}}
function rememberCameraSelection(selection){try{sessionStorage.setItem(CAMERA_KEY,JSON.stringify({selection,saved_at:Date.now()}));}catch{}}
function readCameraSelection(worker){
 try{const stored=JSON.parse(sessionStorage.getItem(CAMERA_KEY)||'null');
  if(!stored||stored.selection?.worker_id!==worker||Date.now()-stored.saved_at>3600000)return null;
  return stored.selection;
 }catch{return null;}
}
function showDocuments(){
 $('docsApp').classList.remove('hidden');$('calcApp').classList.add('hidden');
 $('tabDocs').classList.add('active');$('tabCalc').classList.remove('active');
}
function renderUploadRecovery(){
 recoveryPanel?.remove();recoveryPanel=null;
 if(!pendingDraft||profile?.id!==pendingDraft.worker_id)return;
 recoveryPanel=node('section',null,'card');
 recoveryPanel.append(node('h3','Foto pronta da inviare'),node('p','La foto selezionata è conservata temporaneamente su questo dispositivo. Puoi riprendere l’invio senza scattarla di nuovo.'));
 recoveryPanel.append(button('Riprendi invio',()=>sendUploadDraft(pendingDraft)),button('Elimina bozza',async()=>{
  if(uploading)return;
  await deleteUploadDraft(session.user.id).catch(()=>{});pendingDraft=null;renderUploadRecovery();msg('Bozza eliminata.');
 },true));
 $('workerArea').prepend(recoveryPanel);
}
async function restoreUploadState(){
 if(profile?.role!=='worker'||!profile.active)return;
 const saved=readCameraSelection(session.user.id);
 pendingDraft=await readUploadDraft(session.user.id).catch(()=>null);
 if(saved){
  $('month').value=saved.month;$('workerWeek').value=saved.week||'';
  if(saved.stage==='request'){$('docType').value=saved.category;$('docNote').value=saved.note||'';}
 }
 if(pendingDraft)$('month').value=pendingDraft.payload.month;
 await refreshWorker();
 if(saved&&!pendingDraft){
  try{selectedUpload=validateUploadSelection(saved.stage);}catch{selectedUpload=null;}
  showDocuments();msg('Se la fotocamera ha ricaricato la pagina, scegli la foto dalla galleria. Mese e settimana sono stati recuperati.');
 }
 if(pendingDraft){showDocuments();renderUploadRecovery();}
}
const uploadButtons=['updateSheet','replaceSheet','finalSheet','uploadOther'];
function validateUploadSelection(a){
 if(!profile?.active||profile.role!=='worker')throw new Error('Accedi con un account lavoratore abilitato.');
 const month=$('month').value;
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Seleziona il mese di riferimento.');
 const weekly=['weekly','replacement'].includes(a),week=weekly?$('workerWeek').value:null;
 if(weekly&&(!week||!/^\d{4}-\d{2}-\d{2}$/.test(week)||new Date(week+'T12:00:00').getDay()!==5||week.slice(0,7)!==month)){
  $('workerWeek').focus();throw new Error('Seleziona il venerdì della settimana, nello stesso mese del foglio.');
 }
 const recent=docs.filter(d=>d.category==='presenze'&&['weekly','replacement'].includes(d.stage)&&d.week_ending===week).sort((a,b)=>b.created_at.localeCompare(a.created_at));
 if(a==='replacement'&&!recent.length)throw new Error('Nessun foglio per questa settimana da sostituire. Usa Aggiorna foglio presenze.');
 return Object.freeze({stage:a,month,week,category:a==='request'?$('docType').value:'presenze',replaces:a==='replacement'?recent[0].id:null,note:a==='request'?$('docNote').value.trim():'',worker_id:session.user.id,site:profile.site});
}
function pick(a){
 if(uploading)return;
 if(pendingDraft){showDocuments();renderUploadRecovery();msg('Riprendi o elimina la foto già pronta prima di sceglierne un’altra.');return;}
 try{
  const selected=validateUploadSelection(a);
  if(a==='final'&&selected.month>=monthNow()&&!confirm('Il mese selezionato è ancora in corso. Il foglio definitivo deve comprendere tutti i giorni del mese. Continuare?'))return;
  if(a==='final'&&!confirm('Confermi che il foglio è completo per TUTTO il mese e firmato a mano?'))return;
  selectedUpload=selected;rememberCameraSelection(selected);showDocuments();$('docPicker').value='';$('docPicker').click();
 }catch(e){err(e);$('appMsg').scrollIntoView({behavior:'smooth',block:'center'});}
}
$('updateSheet').onclick=()=>pick('weekly');$('replaceSheet').onclick=()=>pick('replacement');$('finalSheet').onclick=()=>pick('final');$('uploadOther').onclick=()=>pick('request');
function weekEnding(){const d=new Date(),f=new Date(d);f.setDate(d.getDate()+((5-d.getDay()+7)%7));return isoLocalDate(f);}

$('docPicker').onchange=async()=>{
 // Capture the browser's File immediately, even when Auth is still restoring after a reload.
 const file=$('docPicker').files?.[0];if(!file)return;
 await appReady;
 const selected=selectedUpload;
 if(!selected||uploading)return;
 const allowed=['image/jpeg','image/png','image/webp','application/pdf'];
 if(!allowed.includes(file.type)||file.size>12*1024*1024){err(new Error('Sono accettati JPEG, PNG, WebP e PDF fino a 12 MB.'));$('appMsg').scrollIntoView({behavior:'smooth',block:'center'});return;}
 if(session?.user?.id!==selected.worker_id||!profile?.active){err(new Error('Account cambiato: seleziona nuovamente il documento.'));return;}
 const id=crypto.randomUUID(),ext=file.type==='application/pdf'?'pdf':file.type.split('/')[1],path=selected.worker_id+'/'+selected.month+'/'+id+'.'+ext;
 const payload={id,worker_id:selected.worker_id,site:selected.site,month:selected.month,category:selected.category,stage:selected.stage,week_ending:selected.week,replaces:selected.replaces,file_path:path,file_name:file.name,note:selected.note,authorization:['ferie','rol'].includes(selected.category)?'pending':'not_applicable'};
 pendingDraft={worker_id:selected.worker_id,id,path,payload,file};
 selectedUpload=null;
 // Persist the actual photo before any network transfer. If storage is unavailable, still allow sending.
 await saveUploadDraft(pendingDraft).catch(()=>{});
 clearCameraSelection();
 await sendUploadDraft(pendingDraft);
};
async function sendUploadDraft(draft){
 if(!draft||uploading||session?.user?.id!==draft.worker_id||!profile?.active)return;
 uploading=true;uploadButtons.forEach(id=>$(id).disabled=true);
 try{
  showDocuments();msg('Caricamento in corso… Attendi la conferma prima di chiudere.');
  // A response may have been lost after the INSERT succeeded. Reuse the saved UUID, never duplicate it.
  const existing=await sb.from('documents').select('id').eq('id',draft.id).maybeSingle();
  if(existing.error)throw existing.error;
  if(!existing.data){
   const {error:uploadError}=await sb.storage.from('private-documents').upload(draft.path,draft.file,{contentType:draft.file.type,upsert:false});
   if(uploadError&&String(uploadError.statusCode)!=='409'&&!/already exists|duplicate/i.test(uploadError.message||''))throw uploadError;
   const {error}=await sb.from('documents').insert(draft.payload);
   if(error){
    if(error.code==='23505'){
     const check=await sb.from('documents').select('id').eq('id',draft.id).maybeSingle();
     if(check.error||!check.data)throw error;
    }else throw error;
   }
  }
  await deleteUploadDraft(draft.worker_id).catch(()=>{});
  pendingDraft=null;clearCameraSelection();renderUploadRecovery();
  msg('Documento inviato correttamente. In attesa di verifica del responsabile.');await refreshWorker();
 }catch(e){
  renderUploadRecovery();err(e);$('appMsg').scrollIntoView({behavior:'smooth',block:'center'});
 }finally{uploading=false;uploadButtons.forEach(id=>$(id).disabled=false);}
}
async function openFile(d){
 try{
  msg('Apertura documento…');
  const {data,error}=await sb.storage.from('private-documents').createSignedUrl(d.file_path,90);
  if(error)throw error;
  if(!data?.signedUrl)throw new Error('Collegamento al documento non disponibile. Riprova.');
  // Same-tab navigation works after the asynchronous request without popup permissions.
  // The browser Back action returns to the app; the private link expires after 90 seconds.
  window.location.assign(data.signedUrl);
 }catch(e){err(e);$('appMsg').scrollIntoView({behavior:'smooth',block:'center'});}
}
async function refreshWorker(){if(!profile?.active||profile.role==='admin')return;const {data,error}=await sb.from('documents').select('*').eq('worker_id',session.user.id).eq('month',$('month').value).order('created_at',{ascending:false});if(error){err(error);return}docs=data||[];const area=$('docList');area.replaceChildren();if(!docs.length)area.textContent='Nessun documento per questo mese.';
 for(const d of docs){const row=node('div',null,'doc-row'),left=node('div');left.append(node('strong',`${typeLabel[d.category]} · ${stageLabel[d.stage]}`),node('small',`${dateLabel(d.created_at)} · ${statusLabel[d.review_status]}`));if(d.review_reason)left.append(node('small','Motivo: '+d.review_reason));if(d.authorization==='approved')left.append(node('small','Richiesta autorizzata'));if(d.authorization==='denied')left.append(node('small','Richiesta non autorizzata'));row.append(left,button('Apri',()=>openFile(d),true));area.append(row)}
 const weeks=docs.filter(d=>['weekly','replacement'].includes(d.stage));const finals=docs.filter(d=>d.stage==='final');$('weeklySummary').textContent=`${weeks.length} caricamenti settimanali · ${finals.length? 'Foglio definitivo: '+statusLabel[finals[0].review_status]:'Foglio definitivo non ancora verificato'}`;
 const {data:notes}=await sb.from('notifications').select('*').eq('worker_id',session.user.id).order('created_at',{ascending:false}).limit(30);const n=$('myNotifications');n.replaceChildren();if(!notes?.length)n.textContent='Nessun messaggio.';for(const t of notes||[]){const row=node('div',null,'doc-row'),left=node('div');left.append(node('strong',t.message),node('small',dateLabel(t.created_at)));row.append(left);if(!t.read_at)row.append(button('Letto',async()=>{await sb.rpc('mark_notification_read',{p_id:t.id});await refreshWorker()},true));n.append(row)}}
$('adminSite').onchange=refreshAdmin;$('adminMonth').onchange=refreshAdmin;$('refreshAdmin').onclick=refreshAdmin;
async function refreshAdmin(){if(profile?.role!=='admin')return;const [p,d]=await Promise.all([sb.from('profiles').select('*').order('full_name'),sb.from('documents').select('*').eq('month',$('adminMonth').value).order('created_at',{ascending:false})]);if(p.error||d.error){err(p.error||d.error);return}people=p.data||[];docs=(d.data||[]).filter(x=>!$('adminSite').value||x.site===$('adminSite').value);const active=people.filter(x=>x.active&&x.role==='worker'&&(!$('adminSite').value||x.site===$('adminSite').value));$('adminStats').textContent=`${active.length} lavoratori attivi · ${docs.length} caricamenti nel mese · ${docs.filter(x=>x.review_status==='pending').length} da verificare`;
 const pend=$('pendingDocs'),done=$('reviewedDocs');pend.replaceChildren();done.replaceChildren();for(const d of docs.filter(d=>!docs.some(x=>x.replaces===d.id))){const person=people.find(x=>x.id===d.worker_id),target=d.review_status==='pending'?pend:done,row=node('div',null,'doc-row'),left=node('div');left.append(node('strong',`${person?.full_name||'Lavoratore'} · ${typeLabel[d.category]}`),node('small',`${stageLabel[d.stage]} · ${dateLabel(d.created_at)} · ${statusLabel[d.review_status]}`));if(d.review_reason)left.append(node('small',d.review_reason));row.append(left);const controls=node('div',null,'doc-toolbar');controls.append(button('Apri',()=>openFile(d),true));if(d.review_status==='pending'){controls.append(button('Verifica',()=>review(d,'verified')),button('Respingi',()=>review(d,'rejected'),true))}else if(d.review_status==='verified'&&['ferie','rol'].includes(d.category)&&d.authorization==='pending'){controls.append(button('Autorizza',()=>authorize(d,'approved')),button('Non autorizzare',()=>authorize(d,'denied'),true))}row.append(controls);target.append(row)}if(!pend.childNodes.length)pend.textContent='Nessun documento da verificare.';if(!done.childNodes.length)done.textContent='Nessun documento verificato o respinto.';
 const users=$('pendingUsers');users.replaceChildren();for(const p of people.filter(x=>!x.active&&x.role==='worker')){const row=node('div',null,'doc-row'),left=node('div');left.append(node('strong',p.full_name||p.id),node('small',p.id));const select=node('select');select.className='doc-select';for(const [v,label] of [['N153','Corte d’Appello'],['N148','ENAV']]){const opt=node('option',label);opt.value=v;select.append(opt)}const ctl=node('div');ctl.append(select,button('Abilita',async()=>{if(!confirm('Abilitare questo lavoratore per '+select.value+'?'))return;const {error}=await sb.from('profiles').update({active:true,site:select.value}).eq('id',p.id);if(error)err(error);else refreshAdmin()}));row.append(left,ctl);users.append(row)}if(!users.childNodes.length)users.textContent='Nessuna richiesta di registrazione in sospeso.'}
async function addNotification(worker_id,kind,message,week_ending=null){return sb.from('notifications').insert({worker_id,kind,message,week_ending,created_by:session.user.id})}
async function review(d,status){let reason=null;if(status==='rejected'){reason=prompt('Motivo del rifiuto (obbligatorio):');if(!reason?.trim())return}else if(!confirm('Confermi la verifica del documento?'))return;const {error}=await sb.from('documents').update({review_status:status,review_reason:reason,reviewed_by:session.user.id,reviewed_at:new Date().toISOString()}).eq('id',d.id);if(error){err(error);return}const r=await addNotification(d.worker_id,'review',status==='verified'?'Il tuo documento è stato verificato.':'Documento respinto: '+reason);if(r.error)err(r.error);await refreshAdmin()}
async function authorize(d,status){if(!confirm(status==='approved'?'Autorizzare la richiesta?':'Non autorizzare la richiesta?'))return;const {error}=await sb.from('documents').update({authorization:status,authorized_at:new Date().toISOString()}).eq('id',d.id);if(error){err(error);return}const r=await addNotification(d.worker_id,'authorization',status==='approved'?'La tua richiesta è stata autorizzata.':'La tua richiesta non è stata autorizzata.');if(r.error)err(r.error);await refreshAdmin()}
$('findMissing').onclick=async()=>{const week=$('weekDate').value,site=$('adminSite').value;if(!week){msg('Seleziona un venerdì.');return}if(new Date(week+'T12:00:00').getDay()!==5){msg('Seleziona una data che sia venerdì.');return}const first=new Date(week+'T12:00:00');first.setDate(first.getDate()-6);const start=isoLocalDate(first);const {data,error}=await sb.from('documents').select('worker_id,week_ending,created_at,stage,review_status').in('stage',['weekly','replacement']).eq('week_ending',week);if(error){err(error);return}const delivered=new Set((data||[]).filter(x=>x.review_status!=='rejected').map(x=>x.worker_id));missing=people.filter(p=>p.active&&p.role==='worker'&&p.site&&(!site||p.site===site)&&!delivered.has(p.id));const area=$('missingList');area.replaceChildren();if(!missing.length){area.textContent='Tutti hanno consegnato per la settimana selezionata.';return}for(const p of missing){const row=node('label',null,'doc-row'),cb=document.createElement('input');cb.type='checkbox';cb.checked=true;cb.style.width='auto';cb.dataset.uid=p.id;row.append(cb,node('span',`${p.full_name} · ${p.site}`));area.append(row)}msg(`${missing.length} lavoratori senza consegna per il venerdì selezionato.`)};
function selectedMissing(){return missing.filter(p=>document.querySelector(`#missingList input[data-uid="${p.id}"]`)?.checked)}
$('sendReminders').onclick=async()=>{const sel=selectedMissing(),week=$('weekDate').value;if(!sel.length){msg('Nessun lavoratore selezionato.');return}if(!confirm(`Inviare ${sel.length} solleciti nell'app?`))return;let sent=0,duplicates=0;for(const p of sel){const r=await addNotification(p.id,'reminder',`Non risulta consegnato il foglio presenze della settimana con venerdì ${week}. Carica il foglio cartaceo compilato e firmato.`,week);if(r.error){if(r.error.code==='23505')duplicates++;else err(r.error)}else sent++}msg(`${sent} notifiche nell'app registrate; ${duplicates} solleciti già presenti.`)};
$('whatsappReminders').onclick=()=>{const sel=selectedMissing();if(!sel.length){msg('Nessun lavoratore selezionato.');return}const without=sel.filter(x=>!x.phone);if(without.length){msg('Numeri WhatsApp mancanti per: '+without.map(x=>x.full_name).join(', ')+'. Inseriscili in Supabase nella tabella profiles, colonna phone.');return}if(!confirm(`Aprire WhatsApp per ${sel.length} lavoratori? Dovrai premere Invia in ogni conversazione.`))return;for(const p of sel){const phone=p.phone.replace(/[^0-9]/g,'');const t=`Buongiorno ${p.full_name}, non risulta ancora caricato il foglio presenze settimanale compilato e firmato. Ti invito a provvedere tramite Ferie Facili. Grazie.`;window.open(`https://wa.me/${phone}?text=${encodeURIComponent(t)}`,'_blank','noopener,noreferrer')}msg('WhatsApp aperto: l’invio effettivo deve essere confermato manualmente. Il browser potrebbe bloccare più schede.')};
$('tabDocs').addEventListener('click',()=>{if(profile?.role==='admin')refreshAdmin();else if(profile?.active)refreshWorker()});
const baseRefreshAdmin=refreshAdmin;
refreshAdmin=async function(){
 await baseRefreshAdmin();
 if(profile?.role!=='admin')return;
 const users=$('pendingUsers');users.replaceChildren();
 for(const p of people.filter(p=>p.role==='worker')){
  const row=node('div',null,'doc-row'),info=node('div');info.append(node('strong',p.full_name||'Nuova registrazione'),node('small',p.active?'Attivo':'Da abilitare'));
  const controls=node('div'),site=node('select'),phone=node('input');site.className='doc-select';site.setAttribute('aria-label','Sede di '+p.full_name);
  for(const [v,label] of [['N153',"N153 — Corte d’Appello"],['N148','N148 — ENAV']]){const o=node('option',label);o.value=v;site.append(o)}site.value=p.site||'N153';
  phone.className='doc-input';phone.type='tel';phone.value=p.phone||'';phone.placeholder='WhatsApp, es. 393331234567';phone.setAttribute('aria-label','Numero WhatsApp di '+p.full_name);
  controls.append(site,phone,button(p.active?'Salva modifiche':'Abilita lavoratore',async()=>{
   const phoneValue=phone.value.replace(/[^0-9]/g,'');if(phoneValue&&!/^[0-9]{8,15}$/.test(phoneValue)){msg('Verifica il numero, incluso il prefisso internazionale.');return}
   const {error}=await sb.from('profiles').update({active:true,site:site.value,phone:phoneValue||null}).eq('id',p.id);if(error)err(error);else{msg('Profilo aggiornato.');await refreshAdmin()}
  }));
  if(p.active)controls.append(button('Disabilita accesso',async()=>{if(!confirm('Disabilitare '+p.full_name+'?'))return;const {error}=await sb.from('profiles').update({active:false}).eq('id',p.id);if(error)err(error);else await refreshAdmin()},true));
  row.append(info,controls);users.append(row);
 }
 if(!users.childNodes.length)users.textContent='Nessuna registrazione lavoratore.';
 const deliveries=$('deliveryList');deliveries.replaceChildren();
 for(const p of people.filter(p=>p.active&&p.role==='worker'&&(!$('adminSite').value||p.site===$('adminSite').value))){
  const current=docs.filter(d=>d.worker_id===p.id&&!docs.some(x=>x.replaces===d.id));
  const final=current.find(d=>d.stage==='final');
  const row=node('div',null,'doc-row');row.append(node('strong',p.full_name),node('small',`${current.filter(d=>['weekly','replacement'].includes(d.stage)&&d.review_status!=='rejected').length} settimane consegnate · Definitivo: ${final?statusLabel[final.review_status]:'MANCANTE'}`));deliveries.append(row);
 }
 if(!deliveries.childNodes.length)deliveries.textContent='Nessun lavoratore attivo nella sede selezionata.';
 const {data,error}=await sb.from('audit_log').select('*').order('created_at',{ascending:false}).limit(100);
 const log=$('auditList');log.replaceChildren();if(error){log.textContent='Impossibile aggiornare lo storico.';return}
 const labels={upload:'Documento caricato',review:'Documento verificato / richiesta aggiornata',profile_update:'Profilo aggiornato'};
 for(const a of data||[]){const row=node('div',null,'doc-row'),actor=people.find(p=>p.id===a.actor_id);row.append(node('strong',labels[a.action]||a.action),node('small',`${dateLabel(a.created_at)} · ${actor?.full_name||'Configurazione'} · ${a.target_id||''}`));log.append(row)}
 if(!log.childNodes.length)log.textContent='Nessuna operazione registrata.';
};

/* Drive TEST: all OAuth secrets and Google tokens stay in the backend. */
let drivePanel;
async function driveCall(action,extra={}){
 const {data,error}=await authClient.auth.getSession();if(error)throw error;
 if(!data.session)throw new Error('Accedi nuovamente.');
 const response=await fetch(SUPABASE_URL+'/functions/v1/drive-archive',{
  method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+data.session.access_token},
  body:JSON.stringify({action,...extra})
 });
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Archivio Drive non disponibile.');
 return result;
}
async function refreshDrive(){
 if(profile?.role!=='admin'||!profile.active)return;
 if(!drivePanel){drivePanel=node('section');drivePanel.style.cssText='padding:18px;margin:16px 0;border:1px solid #ddd;border-radius:16px';$('adminArea').prepend(drivePanel);}
 drivePanel.replaceChildren(node('h3','Archivio Google Drive · TEST'));
 const summary=node('p','Verifica del collegamento…'),controls=node('div',null,'doc-toolbar'),list=node('div');drivePanel.append(summary,controls,list);
 try{
  const result=await driveCall('status');
  summary.textContent=!result.configured?'Configurazione OAuth da completare nel backend.':!result.connection?'Google Drive non ancora collegato.':'Google Drive collegato. Controlla lo stato di ogni documento.';
  if(!result.connection){
   controls.append(button('Collega Google Drive',async()=>{
    try{const r=await driveCall('connect');location.assign(r.url)}catch(e){err(e)}
   }));
  }
  controls.append(button('Aggiorna stato',()=>refreshDrive(),true));
  if(result.connection)controls.append(button('Elabora prossimo documento',async()=>{
   try{const r=await driveCall('process');msg(r.archived?'Documento archiviato e riletto correttamente da Drive.':r.error||r.reason||'Nessun documento in attesa.');await refreshDrive()}catch(e){err(e)}
  },true));
  if(!result.configured){const help=node('p','Callback da registrare nel client OAuth Google: '+result.callback);drivePanel.append(help);}
  const labels={pending:'In coda',processing:'Archiviazione in corso',retry:'Ritentativo programmato',archived:'Archiviato e verificato',failed:'Errore: intervento richiesto'};
  for(const j of result.jobs||[]){
   const row=node('div',null,'doc-row'),d=docs.find(x=>x.id===j.document_id),left=node('div');
   left.append(node('strong',d?d.file_name:j.document_id),node('small',(labels[j.status]||j.status)+' · Tentativi: '+j.attempts));
   if(j.last_error)left.append(node('small',j.last_error));
   row.append(left);
   if(j.status==='retry'||j.status==='failed')row.append(button('Riprova',async()=>{try{await driveCall('retry',{document_id:j.document_id});await refreshDrive()}catch(e){err(e)}},true));
   list.append(row);
  }
  if(!result.jobs?.length)list.textContent='Nessun documento in archivio. Per le prove usa esclusivamente documenti fittizi.';
  if((result.jobs||[]).length===200)list.append(node('small','Visualizzati i 200 caricamenti più recenti.'));
 }catch(e){summary.textContent='Impossibile aggiornare l’archivio: '+e.message;}
}
const refreshAdminWithUsers=refreshAdmin;
refreshAdmin=async function(){await refreshAdminWithUsers();await refreshDrive();};

const appReady=boot().catch(err);
