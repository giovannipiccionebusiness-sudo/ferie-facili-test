import {CAUSES,weekDays,calendarWeek,parseDuration,validateDailyRows,localToday,decimal} from './week-changes-core.js?v=53';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const dateLabel=day=>new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(day+'T12:00Z'));
export function createWeekChanges({getClient,getSession,getProfile,onSaved=()=>{}}){
 let active=null,adminPanel=null,revision=0;
 const workerAllowed=d=>getProfile()?.active&&getProfile().role==='worker'&&getSession()?.user.id===d.worker_id;
 const canOpen=d=>d.category==='presenze'&&['weekly','replacement'].includes(d.stage)&&d.review_status!=='rejected';
 function clear(){revision++;active?.close();adminPanel?.remove();adminPanel=null;}
 async function open(input){
  const owner=getSession()?.user.id,token=++revision,client=getClient(),daily=!!input.dailyDay,standalone=!!input.weekDay;
  if(!owner||!getProfile()?.active||getProfile().role!=='worker')throw Error('Accedi come lavoratore');
  let doc,old=null,days;
  if(daily||standalone){const requested=daily?input.dailyDay:input.weekDay;const week=calendarWeek(requested);if(daily&&requested>localToday())throw Error('Non puoi compilare giorni futuri');doc={worker_id:owner,week_ending:week[4]};days=daily?[requested]:week;}
  else{if(!workerAllowed(input)||!canOpen(input))throw Error('Scegli un foglio settimanale personale');const [dr,pr]=await Promise.all([client.from('documents').select('*').eq('id',input.id).single(),client.from('test_worker_week_changes').select('*').eq('document_id',input.id).maybeSingle()]);if(dr.error||pr.error)throw Error('Impossibile aprire le variazioni: riprova');doc=dr.data;old=pr.data;if(!doc||!canOpen(doc))throw Error('Foglio non disponibile');days=weekDays(doc.week_ending,doc.month);}
  const dayResult=await client.from('test_daily_presence').select('*').eq('worker_id',owner).gte('day',days[0]).lte('day',days.at(-1));if(dayResult.error)throw Error('Impossibile caricare i giorni salvati: riprova');const savedDays=dayResult.data||[];
  const valid=()=>token===revision&&workerAllowed(doc)&&getSession()?.user.id===owner;
  if(!valid())throw Error('Sessione cambiata');
  active?.close();const d=el('dialog',null,'wc-dialog'),head=el('header',null,'wc-head'),title=el('h2',daily?(input.dailyDay===localToday()?'Com’è andata oggi?':'Aggiorna questa giornata'):'Controlla la tua settimana'),close=el('button','×','wc-close');title.id='wc-title';d.setAttribute('aria-labelledby',title.id);close.type='button';close.setAttribute('aria-label','Chiudi variazioni settimanali');close.onclick=()=>d.close();head.append(el('span',daily?'PROVA · PRESENZE DEL GIORNO':'PROVA · RIEPILOGO SETTIMANALE','wc-eyebrow'),close,title);d.append(head);
  const body=el('div',null,'wc-body'),today=localToday();const invite=el('aside',null,'wc-invite');invite.append(el('strong',daily?'📝 Ore in più o assenze?':'📝 La tua settimana, in un unico posto'),el('p',daily?'Segnalale qui: aiuti il responsabile ad aggiornare il tuo cartellino.':'Ritrovi i giorni già compilati. Controlla, completa quelli mancanti e conferma.'),el('small',daily?'Nessuna variazione? Conferma la giornata.':'Ricorda di caricare anche il foglio presenze settimanale.'));body.append(invite,el('p',daily?dateLabel(days[0]):dateLabel(days[0])+' — '+dateLabel(days.at(-1)),'wc-period'));const rows=[];

  function amount(parent,label,value=0){
   const group=el('fieldset',null,'wc-amount');group.append(el('legend',label));const input=el('input');input.type='text';input.inputMode='decimal';input.placeholder='Es. 1:30';input.maxLength=40;input.value=value?Math.floor(value/60)+':'+String(value%60).padStart(2,'0'):'';input.setAttribute('aria-label',label);
   const hint=el('small','Ore e minuti: 1,30 = 1.30 = 1:30 = 1 ora e 30 minuti. Puoi scrivere anche 1h30 o 90 min. Una cifra dopo il separatore indica minuti: 1,5 = 1 ora e 5 minuti.','wc-duration-hint'),preview=el('span',null,'wc-duration-preview');hint.id='wc-hint-'+label.replaceAll(' ','-');input.setAttribute('aria-describedby',hint.id);preview.setAttribute('aria-live','polite');
   function update(){if(!input.value.trim()){preview.textContent='';return;}try{const n=parseDuration(input.value);preview.textContent='Durata: '+Math.floor(n/60)+' h '+String(n%60).padStart(2,'0')+' min';input.removeAttribute('aria-invalid');}catch(e){preview.textContent=e.message;input.setAttribute('aria-invalid','true');}}input.addEventListener('input',update);update();group.append(input,hint,preview);parent.append(group);return {read:()=>parseDuration(input.value)};
  }
  for(const day of days){
   const card=el('section',null,'wc-day');card.append(el('h3',dateLabel(day)));body.append(card);if(day>today){card.classList.add('wc-future');card.append(el('p','Giorno futuro · potrai completarlo successivamente'));continue;}
   const saved=savedDays.find(r=>r.day===day)||old?.days?.find(r=>r.day===day);card.append(el('small',saved?'✓ Già inserito · puoi correggerlo':'Da compilare · conferma anche se non ci sono variazioni','wc-day-state'));const choices=el('div',null,'wc-choices'),supLabel=el('label','Supplementare'),sup=el('input'),absenceLabel=el('label','Assenza'),absence=el('input');sup.type=absence.type='checkbox';sup.checked=(saved?.supplementary_minutes||0)>0;absence.checked=!!saved?.cause;supLabel.prepend(sup);absenceLabel.prepend(absence);choices.append(supLabel,absenceLabel);card.append(choices);
   const supBox=el('div'),supAmount=amount(supBox,'Supplementare del '+day,saved?.supplementary_minutes||0);card.append(supBox);
   const absenceBox=el('div'),causeLabel=el('label','Giustificativo'),cause=el('select');cause.setAttribute('aria-label','Giustificativo del '+day);cause.append(new Option('Scegli il motivo',''));for(const [key,label]of Object.entries(CAUSES))cause.append(new Option(label,key));cause.value=saved?.cause||'';causeLabel.append(cause);absenceBox.append(causeLabel);
   const scopeLabel=el('label','Durata'),scope=el('select');scope.setAttribute('aria-label','Durata assenza del '+day);scope.append(new Option('Intera giornata','full'),new Option('Solo alcune ore','partial'));scope.value=saved?.absence_scope||'full';scopeLabel.append(scope);absenceBox.append(scopeLabel);const partialBox=el('div'),absenceAmount=amount(partialBox,'Assenza del '+day,saved?.absence_minutes||0);absenceBox.append(partialBox);card.append(absenceBox);
   const update=()=>{supBox.hidden=!sup.checked;absenceBox.hidden=!absence.checked;partialBox.hidden=scope.value!=='partial';};sup.onchange=absence.onchange=scope.onchange=update;update();rows.push({day,sup,supAmount,absence,cause,scope,absenceAmount});
  }
  const foot=el('footer',null,'wc-footer'),confirmLabel=el('label',daily?'Confermo i dati di questa giornata':'Confermo i dati dei giorni già trascorsi'),confirm=el('input');confirm.type='checkbox';confirmLabel.prepend(confirm);const buttons=el('div',null,'wc-actions'),later=el('button','Compilo dopo','wc-secondary'),save=el('button',daily?'Conferma giornata':'Conferma settimana','wc-primary'),message=el('p',null,'wc-message');message.setAttribute('role','status');for(const b of [later,save])b.type='button';later.onclick=()=>d.close();buttons.append(later,save);if(daily){const unchanged=el('button','Nessuna variazione','wc-no-change');unchanged.type='button';unchanged.onclick=()=>{if(saving)return;for(const row of rows){row.sup.checked=false;row.absence.checked=false;}confirm.checked=true;save.click();};foot.append(unchanged);}foot.append(confirmLabel,buttons,message,el('small','Dati di prova · il responsabile deve verificarli. Le presenze ufficiali non vengono modificate.'));d.append(body,foot);
  save.disabled=!rows.length;let saving=false;d.addEventListener('cancel',e=>{if(saving)e.preventDefault();});
  save.onclick=async()=>{
   if(saving)return;try{
    if(!valid())throw Error('Accedi nuovamente prima di salvare');if(!confirm.checked)throw Error('Spunta la conferma prima di salvare');
    const entries=validateDailyRows(rows.map(r=>({day:r.day,supplementary_minutes:r.sup.checked?r.supAmount.read():0,cause:r.absence.checked?r.cause.value:'',absence_scope:r.absence.checked?r.scope.value:null,absence_minutes:r.absence.checked&&r.scope.value==='partial'?r.absenceAmount.read():null})),days,today);
    if(rows.some(r=>r.absence.checked&&!r.cause.value))throw Error('Scegli il giustificativo per ogni assenza');
    saving=true;save.disabled=later.disabled=close.disabled=true;message.textContent='Salvataggio in corso…';const versions=Object.fromEntries(rows.map(r=>[r.day,savedDays.find(x=>x.day===r.day)?.version??null]));
    const result=daily?await client.rpc('save_test_daily_presence',{p_entry:entries[0],p_expected_version:versions[entries[0].day]}):await client.rpc('save_test_presence_week',{p_week_ending:doc.week_ending,p_entries:entries,p_versions:versions,p_document:doc.id||null,p_week_version:old?.version??null});
    if(result.error)throw Error(result.error.message?.includes('Dati cambiati')?'Dati cambiati: chiudi e riapri la finestra prima di salvare.':'Salvataggio non riuscito. Riprova: il foglio rimane caricato.');if(!valid())return;
    d.close();await onSaved(daily?'day':'week');
   }catch(e){message.textContent=e.message;}finally{saving=false;later.disabled=close.disabled=false;save.disabled=!rows.length;}
  };
  d.addEventListener('close',()=>{d.remove();if(active===d)active=null;});document.body.append(d);active=d;d.showModal();
 }
 async function refreshAdmin({mount,documents,people,month,site=''}){
  if(!getProfile()?.active||getProfile().role!=='admin')return;const owner=getSession()?.user.id,token=revision;
  const dailyResult=await getClient().from('test_daily_presence').select('*').gte('day',month+'-01').lte('day',new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0,12)).toISOString().slice(0,10)).order('day',{ascending:true});
  const result=await getClient().from('test_worker_week_changes').select('*').gte('week_ending',month+'-01').lte('week_ending',new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0,12)).toISOString().slice(0,10)).order('week_ending',{ascending:false});
  if(owner!==getSession()?.user.id||token!==revision||getProfile()?.role!=='admin')return;
  if(!adminPanel){adminPanel=el('section',null,'card wc-admin');mount.prepend(adminPanel);}adminPanel.replaceChildren(el('h3','Supplementare e giustificativi · prova'));
  if(result.error||dailyResult.error){adminPanel.append(el('p','Impossibile caricare le dichiarazioni di prova.'));return;}
  const canonical=new Map();for(const r of result.data||[]){const d=documents.find(d=>d.id===r.document_id);if(!d||d.review_status==='rejected'||documents.some(x=>x.replaces===d.id))continue;for(const day of r.days.sort((a,b)=>a.day.localeCompare(b.day)))if(day.day.startsWith(month))canonical.set(r.worker_id+':'+day.day,{...day,worker_id:r.worker_id});}for(const r of dailyResult.data||[])canonical.set(r.worker_id+':'+r.day,r);
  const groups=new Map();for(const row of canonical.values()){const person=people.find(p=>p.id===row.worker_id);if(site&&person?.site!==site)continue;const friday=calendarWeek(row.day)[4],key=row.worker_id+':'+friday;if(!groups.has(key))groups.set(key,{worker_id:row.worker_id,week_ending:friday,days:[]});groups.get(key).days.push(row);}
  const relevant=[...groups.values()].sort((a,b)=>(people.find(p=>p.id===a.worker_id)?.full_name||'').localeCompare(people.find(p=>p.id===b.worker_id)?.full_name||'','it')||b.week_ending.localeCompare(a.week_ending));
  adminPanel.append(el('p','Inserimenti giornalieri e riepiloghi settimanali, da verificare con il foglio presenze. Ogni giorno compare una sola volta. Le durate sono mostrate in ore decimali. Questi dati non alimentano il foglio ufficiale.','doc-muted'));
  if(!relevant.length)adminPanel.append(el('p','Nessuna dichiarazione settimanale ricevuta per questo mese.'));
  for(const r of relevant){const group=el('details'),summary=el('summary',(people.find(p=>p.id===r.worker_id)?.full_name||'Lavoratore')+' · venerdì '+r.week_ending.slice(8,10)+'/'+r.week_ending.slice(5,7));group.append(summary);const table=el('table'),head=el('tr');for(const name of ['Giorno','S · Supplementare','Giustificativo','Durata assenza'])head.append(el('th',name));table.append(head);
   for(const day of r.days.sort((a,b)=>a.day.localeCompare(b.day))){const tr=el('tr');for(const value of [dateLabel(day.day),decimal(day.supplementary_minutes),day.cause||'—',day.absence_scope==='full'?'Intera giornata':day.absence_scope==='partial'?decimal(day.absence_minutes)+' h':'—'])tr.append(el('td',value));table.append(tr);}const wrap=el('div',null,'wc-table');wrap.append(table);group.append(wrap);adminPanel.append(group);
  }
 }
 return {open,openDay:day=>open({dailyDay:day}),openWeek:day=>open({weekDay:day}),canOpen,clear,refreshAdmin};
}
