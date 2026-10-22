export function revealWorkerTarget(target){
 if(!target)return;const section=target.closest?.('details.worker-section');if(!section)return;
 for(const other of document.querySelectorAll('#workerArea details.worker-section'))other.open=other===section;
}
export function resetWorkerMenu(){for(const section of document.querySelectorAll('#workerArea details.worker-section'))section.open=false;}
function pageRows(area){
 const old=area.nextElementSibling;if(old?.dataset.workerPages==='true')old.remove();const rows=[...area.children].filter(e=>e.classList.contains('doc-row'));if(rows.length<=5)return;
 let limit=5;const controls=document.createElement('div');controls.className='list-pages';controls.dataset.workerPages='true';const render=()=>{rows.forEach((row,i)=>row.hidden=i>=limit);controls.replaceChildren();const count=document.createElement('small');count.textContent=`Visualizzati ${Math.min(limit,rows.length)} di ${rows.length}`;controls.append(count);
  for(const [label,action] of [['Mostra altri 5',()=>{limit+=5;render();}],['Mostra meno',()=>{limit=5;render();area.closest('details')?.querySelector('summary')?.scrollIntoView({behavior:'smooth',block:'nearest'});}]]){if(label==='Mostra altri 5'&&limit>=rows.length||label==='Mostra meno'&&limit<=5)continue;const b=document.createElement('button');b.type='button';b.className='doc-button outline';b.textContent=label;b.onclick=action;controls.append(b);}}
 controls.setAttribute('aria-label','Pagine elenco');area.after(controls);render();
}
export function refreshWorkerMenu(documents,notes){
 const count=document.getElementById('workerUploadCount'),unread=document.getElementById('workerUnreadCount');if(count){count.textContent=String(documents.length);count.setAttribute('aria-label',documents.length+' caricamenti nel mese');}if(unread){const total=notes.filter(n=>!n.read_at).length;unread.textContent=String(total);unread.hidden=total===0;unread.setAttribute('aria-label',total+' messaggi da leggere');}
 for(const id of ['docList','myNotifications']){const area=document.getElementById(id);if(area)pageRows(area);}
}
if(typeof document!=='undefined')for(const section of document.querySelectorAll('#workerArea details.worker-section'))section.addEventListener('toggle',()=>{if(section.open)for(const other of document.querySelectorAll('#workerArea details.worker-section'))if(other!==section)other.open=false;});
