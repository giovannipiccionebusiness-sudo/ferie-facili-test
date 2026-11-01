export const CAUSES={'F':'Ferie','M':'Malattia','L104':'Legge 104','PHR':'ROL / permesso','congedo parentale':'Congedo parentale'};
export const localToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome'}).format(new Date());
export function weekDays(friday,month){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(friday||'')||!/^\d{4}-\d{2}$/.test(month||''))throw Error('Settimana non valida');const d=new Date(friday+'T12:00Z');if(Number.isNaN(+d)||d.toISOString().slice(0,10)!==friday||d.getUTCDay()!==5||!friday.startsWith(month))throw Error('Scegli il venerdì del mese del foglio');
 d.setUTCDate(d.getUTCDate()-4);return Array.from({length:7},(_,i)=>{const x=new Date(d);x.setUTCDate(x.getUTCDate()+i);return x.toISOString().slice(0,10);}).filter(day=>day.startsWith(month));
}
export function duration(h,m){const hour=String(h??'').trim(),minute=String(m??'').trim();if(!/^\d{1,2}$/.test(hour||'0')||!/^\d{1,2}$/.test(minute||'0'))throw Error('Inserisci ore e minuti interi');const n=Number(hour||0)*60+Number(minute||0);if(Number(minute||0)>59||n<=0||n>1440)throw Error('Indica una durata valida, maggiore di zero, fino a 24 ore');return n;}
export function parseDuration(value){
 const s=String(value??'').trim().toLowerCase();let m;
 if((m=s.match(/^(\d{1,4})\s*(?:min|minuti|minuto)$/))){const n=Number(m[1]);if(n>0&&n<=1440)return n;}
 else if((m=s.match(/^(\d{1,2})\s*[,.:;]\s*(\d{1,2})$/))||(m=s.match(/^(\d{1,2})\s+(\d{1,2})$/)))return duration(m[1],m[2]);
 else if((m=s.match(/^(\d{1,2})\s*(?:h|ore|ora)(?:\s*(?:e\s*)?(\d{1,2})\s*(?:m|min|minuti|minuto)?)?$/)))return duration(m[1],m[2]||0);
 else if(/^\d{1,2}$/.test(s))return duration(s,0);
 throw Error('Scrivi ore e minuti, ad esempio 1:30, 1,30 o 90 min. I minuti devono essere tra 00 e 59; massimo 24 ore.');
}
export function validateChanges(rows,friday,month,today=localToday()){
 const expected=weekDays(friday,month).filter(d=>d<=today);if(!Array.isArray(rows)||rows.length!==expected.length)throw Error('Controlla tutti i giorni già trascorsi della settimana');
 const seen=new Set();return rows.map(r=>{if(!expected.includes(r.day)||seen.has(r.day))throw Error('Giorno non valido o duplicato');seen.add(r.day);if(!Number.isInteger(r.supplementary_minutes)||r.supplementary_minutes<0||r.supplementary_minutes>1440)throw Error('Supplementare non valido');
  if(r.cause&&!Object.hasOwn(CAUSES,r.cause))throw Error('Giustificativo non valido');if(r.cause&&!['full','partial'].includes(r.absence_scope)||!r.cause&&r.absence_scope!==null)throw Error('Indica la durata dell’assenza');
  if(r.absence_scope==='partial'&&(!Number.isInteger(r.absence_minutes)||r.absence_minutes<=0)||r.absence_scope!=='partial'&&r.absence_minutes!==null)throw Error('Ore di assenza non valide');if(r.supplementary_minutes+(r.absence_minutes||0)>1440)throw Error('Il totale del giorno supera 24 ore');
  return {day:r.day,supplementary_minutes:r.supplementary_minutes,cause:r.cause,absence_scope:r.absence_scope,absence_minutes:r.absence_minutes};});
}
export const decimal=n=>(n/60).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});
export function calendarWeek(day){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))throw Error('Giorno non valido');const d=new Date(day+'T12:00Z');if(Number.isNaN(+d)||d.toISOString().slice(0,10)!==day)throw Error('Giorno non valido');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return Array.from({length:7},(_,i)=>{const x=new Date(d);x.setUTCDate(x.getUTCDate()+i);return x.toISOString().slice(0,10);});
}
export function validateDailyRows(rows,expected,today=localToday()){
 if(!Array.isArray(rows)||rows.length!==expected.filter(d=>d<=today).length)throw Error('Controlla tutti i giorni trascorsi');const seen=new Set();for(const r of rows){if(!expected.includes(r.day)||r.day>today||seen.has(r.day))throw Error('Giorno futuro, non valido o duplicato');seen.add(r.day);if(!Number.isInteger(r.supplementary_minutes)||r.supplementary_minutes<0||r.supplementary_minutes>1440)throw Error('Ore in più non valide');if(r.cause&&!Object.hasOwn(CAUSES,r.cause))throw Error('Scegli un giustificativo valido');if(!r.cause&&(r.absence_scope!==null||r.absence_minutes!==null))throw Error('Assenza senza giustificativo');if(r.cause&&!['full','partial'].includes(r.absence_scope))throw Error('Scegli la durata dell’assenza');if(r.absence_scope==='partial'&&(!Number.isInteger(r.absence_minutes)||r.absence_minutes<=0)||r.absence_scope!=='partial'&&r.absence_minutes!==null)throw Error('Durata assenza non valida');if(r.supplementary_minutes+(r.absence_minutes||0)>1440)throw Error('Totale oltre 24 ore');}return rows;
}
