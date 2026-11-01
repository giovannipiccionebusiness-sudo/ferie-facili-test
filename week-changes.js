import {CAUSES,weekDays,parseDuration,validateChanges,localToday,decimal} from './week-changes-core.js?v=51';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const dateLabel=day=>new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(day+'T12:00Z'));
export function createWeekChanges({getClient,getSession,getProfile,onSaved=()=>{}}){
 let active=null,adminPanel=null,revision=0;
 const workerAllowed=d=>getProfile()?.active&&getProfile().role==='worker'&&getSession()?.user.id===d.worker_id;
 const canOpen=d=>d.category==='presenze'&&['weekly','replacement'].includes(d.stage)&&d.review_status!=='rejected';
 function clear(){revision++;active?.close();adminPanel?.remove();adminPanel=null;}
 async function open(input){
  if(!workerAllowed(input)||!canOpen(input))throw Error('Scegli un foglio presenze settimanale personale');const owner=getSession().user.id,token=++revision,client=getClient();
  const [documentResult,previous]=await Promise.all([client.from('documents').select('*').eq('id',input.id).single(),client.from('test_worker_week_changes').select('*').eq('document_id',input.id).maybeSingle()]);
  if(documentResult.error||previous.error)throw Error('Impossibile aprire le variazioni: riprova');const doc=documentResult.data,old=previous.data;
  const valid=()=>token===revision&&workerAllowed(doc)&&getSession()?.user.id===owner;
  if(!valid()||!canOpen(doc))throw Error('Sessione o foglio cambiato');
  active?.close();const d=el('dialog',null,'wc-dialog'),head=el('header',null,'wc-head'),title=el('h2','Com’è andata questa settimana?'),close=el('button','×','wc-close');title.id='wc-title';d.setAttribute('aria-labelledby',title.id);close.type='button';close.setAttribute('aria-label','Chiudi variazioni settimanali');close.onclick=()=>d.close();head.append(el('span','PROVA · PRESENZE SETTIMANALI','wc-eyebrow'),close,title);d.append(head);
  const body=el('div',null,'wc-body'),days=weekDays(doc.week_ending,doc.month),today=localToday();body.append(el('p','Aiutaci a riportare correttamente le tue presenze sul cartellino. Indica ogni settimana le ore in più e i giustificativi di assenza: il responsabile potrà consultarli più facilmente insieme al foglio caricato. Se non ci sono variazioni, basta confermare la settimana.','wc-intro'),el('p',dateLabel(days[0])+' — '+dateLabel(days.at(-1)),'wc-period'));const rows=[];
  function amount(parent,label,value=0){
   const group=el('fieldset',null,'wc-amount');group.append(el('legend',label));const input=el('input');input.type='text';input.inputMode='decimal';input.placeholder='Es. 1:30';input.maxLength=40;input.value=value?Math.floor(value/60)+':'+String(value%60).padStart(2,'0'):'';input.setAttribute('aria-label',label);
   const hint=el('small','Ore e minuti: 1,30 = 1.30 = 1:30 = 1 ora e 30 minuti. Puoi scrivere anche 1h30 o 90 min. Una cifra dopo il separatore indica minuti: 1,5 = 1 ora e 5 minuti.','wc-duration-hint'),preview=el('span',null,'wc-duration-preview');hint.id='wc-hint-'+label.replaceAll(' ','-');input.setAttribute('aria-describedby',hint.id);preview.setAttribute('aria-live','polite');
   function update(){if(!input.value.trim()){preview.textContent='';return;}try{const n=parseDuration(input.value);preview.textContent='Durata: '+Math.floor(n/60)+' h '+String(n%60).padStart(2,'0')+' min';input.removeAttribute('aria-invalid');}catch(e){preview.textContent=e.message;input.setAttribute('aria-invalid','true');}}input.addEventListener('input',update);update();group.append(input,hint,preview);parent.append(group);return {read:()=>parseDuration(input.value)};
  }
  for(const day of days){
   const card=el('section',null,'wc-day');card.append(el('h3',dateLabel(day)));body.append(card);if(day>today){card.classList.add('wc-future');card.append(el('p','Giorno futuro · potrai completarlo successivamente'));continue;}
   const saved=old?.days?.find(r=>r.day===day),choices=el('div',null,'wc-choices'),supLabel=el('label','Supplementare'),sup=el('input'),absenceLabel=el('label','Assenza'),absence=el('input');sup.type=absence.type='checkbox';sup.checked=(saved?.supplementary_minutes||0)>0;absence.checked=!!saved?.cause;supLabel.prepend(sup);absenceLabel.prepend(absence);choices.append(supLabel,absenceLabel);card.append(choices);
   const supBox=el('div'),supAmount=amount(supBox,'Supplementare del '+day,saved?.supplementary_minutes||0);card.append(supBox);
   const absenceBox=el('div'),causeLabel=el('label','Giustificativo'),cause=el('select');cause.setAttribute('aria-label','Giustificativo del '+day);cause.append(new Option('Scegli il motivo',''));for(const [key,label]of Object.entries(CAUSES))cause.append(new Option(label,key));cause.value=saved?.cause||'';causeLabel.append(cause);absenceBox.append(causeLabel);
   const scopeLabel=el('label','Durata'),scope=el('select');scope.setAttribute('aria-label','Durata assenza del '+day);scope.append(new Option('Intera giornata','full'),new Option('Solo alcune ore','partial'));scope.value=saved?.absence_scope||'full';scopeLabel.append(scope);absenceBox.append(scopeLabel);const partialBox=el('div'),absenceAmount=amount(partialBox,'Assenza del '+day,saved?.absence_minutes||0);absenceBox.append(partialBox);card.append(absenceBox);
   const update=()=>{supBox.hidden=!sup.checked;absenceBox.hidden=!absence.checked;partialBox.hidden=scope.value!=='partial';};sup.onchange=absence.onchange=scope.onchange=update;update();rows.push({day,sup,supAmount,absence,cause,scope,absenceAmount});
  }
  const foot=el('footer',null,'wc-footer'),confirmLabel=el('label','Confermo il supplementare e le assenze indicati per i giorni già trascorsi'),confirm=el('input');confirm.type='checkbox';confirmLabel.prepend(confirm);const buttons=el('div',null,'wc-actions'),later=el('button','Compilo dopo','wc-secondary'),save=el('button','Conferma settimana','wc-primary'),message=el('p',null,'wc-message');message.setAttribute('role','status');for(const b of [later,save])b.type='button';later.onclick=()=>d.close();buttons.append(later,save);foot.append(confirmLabel,buttons,message,el('small','Dati di prova · il responsabile deve verificarli. Le presenze ufficiali non vengono modificate.'));d.append(body,foot);
  let saving=false;d.addEventListener('cancel',e=>{if(saving)e.preventDefault();});
  save.onclick=async()=>{
   if(saving)return;try{
    if(!valid())throw Error('Accedi nuovamente prima di salvare');if(!confirm.checked)throw Error('Spunta la conferma prima di salvare');
    const entries=validateChanges(rows.map(r=>({day:r.day,supplementary_minutes:r.sup.checked?r.supAmount.read():0,cause:r.absence.checked?r.cause.value:'',absence_scope:r.absence.checked?r.scope.value:null,absence_minutes:r.absence.checked&&r.scope.value==='partial'?r.absenceAmount.read():null})),doc.week_ending,doc.month,today);
    if(rows.some(r=>r.absence.checked&&!r.cause.value))throw Error('Scegli il giustificativo per ogni assenza');
    saving=true;save.disabled=later.disabled=close.disabled=true;message.textContent='Salvataggio in corso…';const payload={document_id:doc.id,worker_id:owner,week_ending:doc.week_ending,days:entries,confirmed:true};
    const q=old?client.from('test_worker_week_changes').update({...payload,version:old.version}).eq('document_id',doc.id).eq('version',old.version):client.from('test_worker_week_changes').insert(payload);
    const result=await q.select('*').single();if(result.error||!result.data)throw Error('Salvataggio non riuscito: riapri la finestra e riprova. Il foglio rimane caricato.');if(!valid())return;
    d.close();await onSaved();
   }catch(e){message.textContent=e.message;}finally{saving=false;save.disabled=later.disabled=close.disabled=false;}
  };
  d.addEventListener('close',()=>{d.remove();if(active===d)active=null;});document.body.append(d);active=d;d.showModal();
 }
 async function refreshAdmin({mount,documents,people,month,site=''}){
  if(!getProfile()?.active||getProfile().role!=='admin')return;const owner=getSession()?.user.id,token=revision;
  const result=await getClient().from('test_worker_week_changes').select('*').gte('week_ending',month+'-01').lte('week_ending',new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0,12)).toISOString().slice(0,10)).order('week_ending',{ascending:false});
  if(owner!==getSession()?.user.id||token!==revision||getProfile()?.role!=='admin')return;
  if(!adminPanel){adminPanel=el('section',null,'card wc-admin');mount.prepend(adminPanel);}adminPanel.replaceChildren(el('h3','Supplementare e giustificativi · prova'));
  if(result.error){adminPanel.append(el('p','Impossibile caricare le dichiarazioni di prova.'));return;}
  const relevant=(result.data||[]).filter(r=>{const d=documents.find(d=>d.id===r.document_id);return d&&d.review_status!=='rejected'&&!documents.some(x=>x.replaces===d.id)&&(!site||d.site===site);}).sort((a,b)=>(people.find(p=>p.id===a.worker_id)?.full_name||'').localeCompare(people.find(p=>p.id===b.worker_id)?.full_name||'','it')||b.week_ending.localeCompare(a.week_ending));
  adminPanel.append(el('p','Dichiarazioni dei lavoratori, da verificare sul foglio allegato. Le durate sono mostrate in ore decimali. Questi dati non alimentano il foglio ufficiale.','doc-muted'));
  if(!relevant.length)adminPanel.append(el('p','Nessuna dichiarazione settimanale ricevuta per questo mese.'));
  for(const r of relevant){const group=el('details'),summary=el('summary',(people.find(p=>p.id===r.worker_id)?.full_name||'Lavoratore')+' · venerdì '+r.week_ending.slice(8,10)+'/'+r.week_ending.slice(5,7));group.append(summary);const table=el('table'),head=el('tr');for(const name of ['Giorno','S · Supplementare','Giustificativo','Durata assenza'])head.append(el('th',name));table.append(head);
   for(const day of r.days){const tr=el('tr');for(const value of [dateLabel(day.day),decimal(day.supplementary_minutes),day.cause||'—',day.absence_scope==='full'?'Intera giornata':day.absence_scope==='partial'?decimal(day.absence_minutes)+' h':'—'])tr.append(el('td',value));table.append(tr);}const wrap=el('div',null,'wc-table');wrap.append(table);group.append(wrap);adminPanel.append(group);
  }
 }
 return {open,canOpen,clear,refreshAdmin};
}
