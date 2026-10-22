import {revealWorkerTarget} from './worker-menu.js?v=30';
export function guideSteps(kind){
 const other=kind==='other';return [
 {title:'Prepara il foglio',text:other?'Compila il modulo cartaceo relativo alla richiesta e firmalo. Per ferie e ROL controlla prima i residui nell’ultimo cedolino.':'Compila lo stesso foglio cartaceo durante tutto il mese. Per il definitivo, controlla che il mese sia completo e il foglio firmato.',target:other?'docType':'month'},
 {title:other?'Scegli il modulo':'Scegli il mese',text:other?'Seleziona Ferie, ROL, Legge 104, Malattia oppure Congedo parentale. Per il congedo puoi aggiungere più foto e inviarle insieme in un unico PDF.':'Seleziona il mese a cui si riferisce il foglio, anche se stai caricando in un mese successivo.',target:other?'docType':'month'},
 {title:other?'Indica il periodo':'Scegli il venerdì',text:other?'Indica il periodo o una breve nota. Non inserire diagnosi o dettagli sanitari.':'Per un aggiornamento o una sostituzione settimanale seleziona il venerdì della settimana. Per il definitivo mensile questo campo non serve.',target:other?'docNote':'workerWeek'},
 {title:'Avvia il caricamento',text:other?'Premi “Carica modulo firmato”, poi scegli la foto o il PDF.':'Premi “Aggiorna foglio presenze” per l’invio settimanale; “Sostituisci foglio settimanale” per correggere un invio; “Invia foglio definitivo” solo a mese completo.',target:other?'uploadOther':'updateSheet'},
 {title:'Fotografa tutto il foglio',text:'Appoggia il foglio su una superficie scura e uniforme, fuori dalla busta trasparente. Inquadra tutti e quattro i bordi, con buona luce, senza dita sul testo. Puoi anche scegliere una foto o un PDF già salvato.',target:other?'uploadOther':'finalSheet'},
 {title:'Attendi la conferma',text:'Dopo aver scelto il file, attendi la barra di avanzamento e il messaggio di caricamento completato. Se compare un errore, segui il messaggio e riprova. Tornare dalla fotocamera non significa che il documento sia già stato inviato.',target:'appMsg'},
 {title:'Controlla l’invio',text:'Cerca il documento in “I miei caricamenti”. “In verifica” significa che il responsabile deve ancora controllarlo. Leggi i messaggi: per ferie e ROL la verifica del documento e l’autorizzazione della richiesta sono due passaggi distinti.',target:'docList'}
 ];
}
const worker=document.getElementById('workerArea'),start=document.getElementById('startWorkerGuide');
if(worker&&start){
 let index=0,kind='presenze',previousFocus=null;const panel=document.createElement('section');panel.className='worker-guide-panel';panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-label','Guida passo passo');
 const make=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 const label=make('label','Cosa vuoi caricare?'),select=make('select');select.id='workerGuideKind';label.htmlFor=select.id;select.className='doc-select';for(const [v,t] of [['presenze','Foglio presenze'],['other','Altri moduli']]){const o=make('option',t);o.value=v;select.append(o);}
 const count=make('p'),title=make('h3'),text=make('p'),controls=make('div');controls.className='worker-guide-controls';const back=make('button','Indietro'),next=make('button','Avanti'),close=make('button','Chiudi guida');for(const b of [back,next,close])b.type='button';count.setAttribute('aria-live','polite');title.tabIndex=-1;panel.append(label,select,count,title,text,controls);controls.append(back,next,close);document.body.append(panel);
 function unmark(){document.querySelectorAll('.worker-guide-target').forEach(e=>e.classList.remove('worker-guide-target'));}
 function render(){const steps=guideSteps(kind),s=steps[index];count.textContent=`Passaggio ${index+1} di ${steps.length}`;title.textContent=s.title;text.textContent=s.text;back.disabled=index===0;next.disabled=index===steps.length-1;unmark();const target=document.getElementById(s.target);if(target){revealWorkerTarget(target);target.classList.add('worker-guide-target');target.scrollIntoView({behavior:'smooth',block:'center'});}title.focus({preventScroll:true});}
 function stop(){panel.hidden=true;unmark();document.body.classList.remove('worker-guide-active');if(previousFocus?.isConnected&&!worker.classList.contains('hidden'))previousFocus.focus({preventScroll:true});}
 start.onclick=()=>{previousFocus=start;index=0;panel.hidden=false;document.body.classList.add('worker-guide-active');render();};back.onclick=()=>{if(index>0){index--;render();}};next.onclick=()=>{if(index<guideSteps(kind).length-1){index++;render();}};close.onclick=stop;select.onchange=()=>{kind=select.value;index=0;render();};document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden)stop();});
 new MutationObserver(()=>{if(worker.classList.contains('hidden')||document.getElementById('docsApp')?.classList.contains('hidden'))stop();}).observe(document.getElementById('docsApp'),{attributes:true,subtree:true,attributeFilter:['class']});
}


