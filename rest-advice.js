// Administrative suggestions only. The existing projection engine is reused unchanged.
import {days,date,dec,project} from './leave-core.js';
import {latest,analyse,plan} from './rest-core.js';
export function buildAdvice({roster,snapshots,lots=new Map(),drafts=[],start,end,turns=3,today}){
 date(today);const calendar=days(start,end);if(calendar.length>93||!Number.isInteger(turns)||turns<1||turns>10)throw Error('Scegli un periodo entro tre mesi e da 1 a 10 giorni lavorativi');
 const accounts=new Map(roster.accounts.map(a=>[a.id,a])),results=[],blocked=[];
 const allEntries=[];for(const p of roster.people){const a=accounts.get(p.account_id);for(const e of snapshots.get(p.person_key)?.entries||[])if(['approved','used'].includes(e.state))allEntries.push({...e,person_key:p.person_key,name:p.surname+' '+p.given_name,site:a?.site||''});}
 for(const d of drafts)for(const row of d.rows||[])allEntries.push({...row,person_key:d.person_key,name:d.name,site:d.site,state:'approved'});
 for(const p of roster.people){const key=p.person_key,name=p.surname+' '+p.given_name,account=accounts.get(p.account_id),data=snapshots.get(key),base=latest(data||{});const reject=reason=>blocked.push({person_key:key,name,reason});
  if(!account||account.active===false){reject('Associazione con un account attivo da verificare');continue;}if(!account.site){reject('Sede da confermare');continue;}if(!base){reject('Saldo non disponibile');continue;}
  let analysis;try{analysis=analyse(data,(lots.get(key)||[]).filter(l=>l.period===base.period),today);}catch{reject('Dettaglio annuale da riconciliare con il saldo');continue;}
  const annual=analysis.lots.filter(l=>l.kind==='ferie'&&dec(l.remaining).gt(0)),deadline=annual.filter(l=>l.deadline).map(l=>l.deadline).sort()[0]||null;
  const priority=annual.some(l=>l.overdue)?0:analysis.arrears===true?1:2;
  const reason=priority===0?'Termine documentato superato':priority===1?'Ferie di anni precedenti documentate':'Saldo ferie disponibile: proposta volontaria';
  const ownDrafts=allEntries.filter(e=>e.person_key===key);const projectionData={...data,entries:[...(data.entries||[]),...drafts.filter(d=>d.person_key===key).flatMap(d=>d.rows.map(row=>({...row,state:'approved'})))]};
  const candidates=[],seen=new Set();let problem='Nessun periodo compatibile con orario e saldo ferie';
  for(let i=0;i<calendar.length;i++){const first=calendar[i];if(first<=today||first<=base.period)continue;let candidate=null;
   for(let j=i;j<Math.min(i+turns*7+7,calendar.length);j++){try{const planned=plan(data,{start:first,end:calendar[j]});if(planned.rows[0].day!==first)break;if(planned.rows.length>=turns){if(planned.rows.length===turns)candidate=planned;break;}}catch(e){if(!e.message.includes('Nessun turno')){problem=e.message;break;}}}
   if(!candidate)continue;if(candidate.rows.some(r=>ownDrafts.some(e=>e.day===r.day)))continue;
   try{const prediction=project(projectionData,{start:candidate.start,end:candidate.end,kind:'ferie'});if(!prediction.sufficient){problem='Saldo ferie previsto insufficiente; i ROL restano separati';continue;}
    const sameSite=allEntries.filter(e=>e.person_key!==key&&e.site===account.site&&candidate.rows.some(r=>r.day===e.day));const conflicts=[...new Map(sameSite.map(e=>[e.day+':'+e.person_key,{day:e.day,name:e.name}])).values()];const signature=candidate.start+candidate.end;if(seen.has(signature))continue;seen.add(signature);
    const incomplete=roster.people.some(peer=>accounts.get(peer.account_id)?.site===account.site&&(snapshots.get(peer.person_key)?.unreconciled||[]).length);
    candidates.push({...candidate,available:prediction.kinds.ferie.available,residual:prediction.kinds.ferie.residual,conflicts,coverageIncomplete:incomplete,afterDeadline:!!deadline&&candidate.end>deadline});
   }catch(e){problem=e.message;}
  }
  candidates.sort((a,b)=>Number(a.afterDeadline)-Number(b.afterDeadline)||a.conflicts.length-b.conflicts.length||a.start.localeCompare(b.start));
  if(!candidates.length){reject(problem);continue;}
  results.push({person_key:key,name,site:account.site,baseDate:base.period,ferie:String(base.ferie),rol:String(base.rol),priority,reason,deadline,yearUnknown:analysis.arrears===null,options:candidates.slice(0,3)});
 }
 results.sort((a,b)=>a.priority-b.priority||(a.deadline||'9999').localeCompare(b.deadline||'9999')||dec(b.ferie).cmp(a.ferie)||a.name.localeCompare(b.name));
 return {results,blocked};
}
