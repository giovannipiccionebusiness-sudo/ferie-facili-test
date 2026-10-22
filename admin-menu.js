// Mobile presentation only: actions delegate to the existing, permission-checked controls.
const mobile=matchMedia('(max-width:760px)');
let dashboard,reviewList,authorizationList;
const nestedStates=new WeakMap();
function responsivePanels(){
 document.querySelectorAll('.admin-fold').forEach(p=>p.open=!mobile.matches);
 document.querySelectorAll('.admin-fold details.compact-list').forEach(p=>{
  if(mobile.matches){if(!nestedStates.has(p))nestedStates.set(p,p.open);p.open=true;}
  else if(nestedStates.has(p)){p.open=nestedStates.get(p);nestedStates.delete(p);}
 });
}
function queue(source,target,action){
 target.replaceChildren();
 for(const original of source.querySelectorAll(`[data-admin-action="${action}"]`)){
  const copy=original.cloneNode(true);copy.hidden=false;
  const buttons=original.querySelectorAll('button');
  copy.querySelectorAll('button').forEach((b,i)=>b.onclick=()=>buttons[i].click());
  target.append(copy);
 }
 if(!target.children.length)target.textContent=action==='review'?'Nessun documento da verificare.':'Nessuna richiesta da autorizzare.';
 return target.querySelectorAll('.doc-row').length;
}
function decorateSummary(summary,label,icon,subtitle,count=null){
 summary.replaceChildren();
 const symbol=document.createElement('span');symbol.className='admin-menu-icon';symbol.textContent=icon;symbol.setAttribute('aria-hidden','true');
 const copy=document.createElement('span');copy.className='admin-menu-copy';
 const title=document.createElement('span');title.className='admin-menu-title';title.textContent=label;
 const hint=document.createElement('small');hint.textContent=subtitle;copy.append(title,hint);summary.append(symbol,copy);
 if(count!==null){const badge=document.createElement('span');badge.className='admin-menu-count';badge.textContent=count;summary.append(badge);}
 const arrow=document.createElement('span');arrow.className='admin-menu-arrow';arrow.textContent='⌄';arrow.setAttribute('aria-hidden','true');summary.append(arrow);
}
const menuInfo=[['Drive','☁','Originali e scansioni salvati'],['verificati','✓','Consulta i documenti già controllati'],['Sollecita','🔔','Ricorda gli invii mancanti'],['consegne','▦','Controlla le presenze del mese'],['Storico','◷','Consulta le ultime attività'],['lavoratori','♙','Account, sedi e abilitazioni']];
function fold(card,label){
 if(card.parentElement.classList.contains('admin-fold'))return;
 const panel=document.createElement('details');panel.className='admin-fold';
 const summary=document.createElement('summary');summary.textContent=label;
 const info=menuInfo.find(([key])=>label.includes(key));if(info){const count=label.match(/\((\d+)\)$/);decorateSummary(summary,label.replace(/ \(\d+\)$/,''),info[1],info[2],count?count[1]:null);}
 card.before(panel);panel.append(summary,card);panel.open=!mobile.matches;
}
export function refreshAdminMenu(){
 const operations=document.getElementById('adminOperations');
 if(!dashboard){
  const style=document.createElement('style');style.textContent=`
  .admin-mobile-dashboard{display:none}.admin-fold>summary{display:none}.admin-fold{display:contents}
  @media(max-width:760px){
   #adminOperations{display:flex;flex-direction:column;gap:12px}#adminOperations.hidden{display:none}
   .admin-mobile-dashboard{display:block;order:-20}.admin-mobile-dashboard h2{margin:0 0 8px;font-size:1.3rem}
   .admin-mobile-dashboard details{border:1px solid #bedbd3;border-radius:16px;background:white;margin:10px 0;padding:14px}
   .admin-mobile-dashboard summary,.admin-fold>summary{font-weight:700;color:#075e54;cursor:pointer;font-size:1.05rem}
   .admin-mobile-dashboard .doc-row{display:block;padding:14px 0}.admin-mobile-dashboard .doc-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
   .admin-mobile-dashboard button{min-height:44px}.admin-mobile-dashboard small{display:block}
   .admin-mobile-filters{order:-21;margin:0!important;padding:16px!important}.admin-mobile-filters h2{font-size:1.15rem}
   .admin-original-pending{display:none!important}.admin-fold{display:block;border:1px solid #bedbd3;border-radius:16px;background:white;padding:16px}
   .admin-fold>summary{display:list-item}.admin-fold details.compact-list>summary{display:none}.admin-fold:not([open])>section{display:none}.admin-fold>section{box-shadow:none;margin:12px 0 0!important;padding:0!important;border:0!important}
   .admin-navigation{position:relative;background:transparent;padding:0;margin-bottom:18px}.admin-navigation button{padding:12px 8px;font-size:.95rem}

   .admin-mobile-dashboard>p{font-size:.88rem;margin:0 0 12px;line-height:1.45}
   .admin-mobile-dashboard details,.admin-fold{border:1px solid #d8e7e2;border-radius:20px;padding:0;box-shadow:0 4px 15px #164c3b05;overflow:hidden}
   .admin-mobile-dashboard details{margin:10px 0}.admin-mobile-dashboard summary,.admin-fold>summary{display:flex;align-items:center;gap:11px;padding:16px 14px;list-style:none;min-height:82px}
   .admin-mobile-dashboard summary::-webkit-details-marker,.admin-fold>summary::-webkit-details-marker{display:none}
   .admin-menu-icon{flex:0 0 40px;height:40px;display:grid;place-items:center;background:#e4f5ee;border-radius:13px;font-size:1.35rem;color:#087f71}
   .admin-menu-copy{flex:1;min-width:0}.admin-menu-title{display:block;font-size:1rem;line-height:1.25;color:#173d37}
   .admin-menu-copy small{display:block;font-size:.76rem;font-weight:400;color:#6b807b;margin-top:5px;line-height:1.3}
   .admin-menu-count{display:grid;place-items:center;min-width:27px;height:27px;padding:0 5px;box-sizing:border-box;background:#e8f4ef;border-radius:9px;font-size:.86rem;color:#087365}
   .admin-menu-arrow{font-size:1.2rem;color:#718e86;transition:transform .15s}details[open]>summary>.admin-menu-arrow{transform:rotate(180deg)}
   .admin-mobile-dashboard details[open]>summary,.admin-fold[open]>summary{background:#f0faf6;border-bottom:1px solid #e0eee7}
   .admin-mobile-dashboard details>div{padding:10px 15px 16px;font-size:.9rem;color:#607b72}
   .admin-fold>section>h3{display:none}.admin-fold>section{padding:14px!important;margin:0!important}.admin-mobile-filters{border-radius:20px!important}
   .admin-mobile-dashboard h2{font-size:1.2rem;color:#173d37;margin-bottom:6px}
  }`;document.head.append(style);
  dashboard=document.createElement('section');dashboard.className='admin-mobile-dashboard';
  dashboard.innerHTML='<h2>Da gestire</h2><p class="doc-muted">Documenti e richieste del mese e della sede selezionati.</p><details open><summary></summary><div id="adminMobileReviews"></div></details><details open><summary></summary><div id="adminMobileAuthorizations"></div></details>';
  operations.prepend(dashboard);reviewList=dashboard.querySelector('#adminMobileReviews');authorizationList=dashboard.querySelector('#adminMobileAuthorizations');
  mobile.addEventListener('change',responsivePanels);
 }
 const pending=document.getElementById('pendingDocs'),reviewed=document.getElementById('reviewedDocs');
 const reviews=queue(pending,reviewList,'review'),authorizations=queue(reviewed,authorizationList,'authorize');
 decorateSummary(reviewList.previousElementSibling,'Da verificare','▤','Controlla i documenti ricevuti',reviews);
 decorateSummary(authorizationList.previousElementSibling,'Da autorizzare','✓','Decidi sulle richieste di ferie e ROL',authorizations);
 const filters=document.getElementById('adminSite').closest('section');filters.classList.add('admin-mobile-filters');
 pending.closest('section').classList.add('admin-original-pending');
 for(const card of [...operations.children]){
  if(card.tagName!=='SECTION'||card===filters||card===dashboard||card.contains(pending))continue;
  const label=card.querySelector('h2,h3,summary')?.textContent||'Altre operazioni';fold(card,label);
 }
 for(const p of document.querySelectorAll('.admin-fold details.compact-list')){if(mobile.matches){if(!nestedStates.has(p))nestedStates.set(p,p.open);p.open=true;}}
}
