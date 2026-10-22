import {scanPDF} from './pdf-scan.js?v=30';
import {cleanPaper} from './paper-clean.js?v=30';
import {edgePaper} from './edge-crop.js?v=30';
import {detectPaper,warpImage} from './scanner-core.js?v=30';
// Colour-preserving deterministic processing. No generated text or OCR.
export async function autoScanPhoto(blob){
 let image;const url=URL.createObjectURL(blob);
 try{if(typeof createImageBitmap==='function')image=await createImageBitmap(blob,{resizeWidth:1400,resizeQuality:'high'});else{image=new Image();image.src=url;await image.decode();}
  const src=document.createElement('canvas'),scale=Math.min(1,1800/Math.max(image.width,image.height));src.width=Math.round(image.width*scale);src.height=Math.round(image.height*scale);const ctx=src.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,src.width,src.height);ctx.drawImage(image,0,0,src.width,src.height);
  const small=document.createElement('canvas');small.width=320;small.height=Math.max(1,Math.round(src.height/src.width*320));small.getContext('2d').drawImage(src,0,0,small.width,small.height);const pixelsSmall=small.getContext('2d').getImageData(0,0,small.width,small.height),edge=edgePaper(pixelsSmall);const found=edge?.sleeve?edge:detectPaper(pixelsSmall);
  const points=found.points.map(p=>({x:p.x/small.width*src.width,y:p.y/small.height*src.height}));
  // A page may touch one or more photo edges. The detector validates the shape;
  // do not reject it solely because a corner lies on the image border.
  const cropped=found.detected;
  const side=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),landscape=cropped?(side(points[0],points[1])+side(points[2],points[3]))>(side(points[0],points[3])+side(points[1],points[2])):src.width>src.height;
  const page=document.createElement('canvas');page.width=landscape?1800:1273;page.height=landscape?1273:1800;const out=page.getContext('2d');out.fillStyle='white';out.fillRect(0,0,page.width,page.height);
  if(cropped){const pixels=warpImage(ctx.getImageData(0,0,src.width,src.height),points,page.width,page.height,false);out.putImageData(new ImageData(pixels.data,page.width,page.height),0,0);}
  else{const scale=Math.min(page.width/src.width,page.height/src.height);out.drawImage(src,(page.width-src.width*scale)/2,(page.height-src.height*scale)/2,src.width*scale,src.height*scale);}
  const pixels=cleanPaper(out.getImageData(0,0,page.width,page.height));out.putImageData(new ImageData(pixels.data,page.width,page.height),0,0);
  const file=await new Promise(r=>page.toBlob(r,'image/jpeg',.93));if(!file)throw Error('Impossibile preparare la scansione.');return {file,cropped,width:page.width,height:page.height};
 }finally{image?.close?.();URL.revokeObjectURL(url);}
}
export function createAutoArchiveScanner({client,allowed,openOriginal,monthlyStatus,documentScanStatus,onMonthClosed=()=>{}}){
 let queue=Promise.resolve(),epoch=0;const jobs=new Map(),urls=new Set(),timers=new Set(),closedSeen=new Set();
 const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 function clear(){epoch++;for(const t of timers)clearTimeout(t);timers.clear();jobs.clear();for(const url of urls)URL.revokeObjectURL(url);urls.clear();document.querySelectorAll('.auto-scan-image').forEach(i=>i.removeAttribute('src'));document.querySelectorAll('.auto-scan-dialog').forEach(d=>{d.close();d.remove();});}
 function preview(url,d){if(!allowed())return;const dialog=node('dialog');dialog.className='auto-scan-dialog';const img=node('img');img.src=url;img.alt='Foto ritagliata e migliorata';const b=node('button','Chiudi');b.type='button';b.onclick=()=>{dialog.close();dialog.remove();};dialog.append(node('h3','Scansione automatica'),img,b);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();}
 function render(d,container){
  const box=node('div');box.className='auto-scan';container.append(box);
  const original=node('button','Apri originale');original.className='doc-link';original.type='button';original.onclick=()=>{if(allowed())openOriginal(d);};
  if(d.category==='presenze'&&d.stage!=='final'){box.append(node('small','Aggiornamento settimanale: si conserva solo l’originale fino alla chiusura mensile.'),original);return;}
  const monthly=d.category==='presenze'&&d.stage==='final',pdf=/\.pdf$/i.test(d.file_path||d.file_name);
  if(!/\.(jpe?g|png|webp)$/i.test(d.file_path||d.file_name)&&!pdf){box.append(node('small','Formato non elaborabile: originale conservato.'),original);return;}
  const state=node('small','In attesa della scansione automatica…');box.append(state,original);const generation=epoch;
  function current(){return generation===epoch&&allowed()&&box.isConnected;}
  async function obtain(){
   if(!current())return null;
   const db=client();if(monthly){const latest=await db.from('documents').select('id').eq('worker_id',d.worker_id).eq('month',d.month).eq('category','presenze').eq('stage','final').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1);if(latest.error)throw latest.error;if(latest.data?.[0]?.id!==d.id)return {skip:true};}
   const r=await db.from('test_document_scans').select('*').eq('document_id',d.id).maybeSingle();if(r.error)throw r.error;
   if(!current())return null;
   let row=r.data?.source_path===d.file_path&&r.data.algorithm_version===(monthly&&!pdf?4:5)?r.data:null,blob;
   if(row){const saved=await db.storage.from('document-scans-test').download(row.file_path);if(!saved.error)blob=saved.data;}
   if(!blob){state.textContent='Ritaglio e miglioramento automatici in corso…';const src=await db.storage.from('private-documents').download(d.file_path);if(src.error)throw src.error;if(!current())return null;
    const result=pdf?await scanPDF(src.data,autoScanPhoto,(n,total)=>{state.textContent=`Ritaglio e miglioramento pagina ${n} di ${total}…`;}):await autoScanPhoto(src.data);if(!current())return null;blob=result.file;
    const path=d.id+(pdf?'/auto-v3.pdf':'/auto-v3.jpg'),upload=await db.storage.from('document-scans-test').upload(path,blob,{contentType:pdf?'application/pdf':'image/jpeg',upsert:true});if(upload.error)throw upload.error;if(!current())return null;
    row={document_id:d.id,source_path:d.file_path,file_path:path,cropped:result.cropped,algorithm_version:monthly&&!pdf?4:5};const save=await db.from('test_document_scans').upsert(row,{onConflict:'document_id'});if(save.error)throw save.error;
   }
   if(!current())return null;const url=URL.createObjectURL(blob);urls.add(url);return {url,cropped:row.cropped,pdf};
  }
  function start(){if(!current())return;state.textContent='Preparazione della scansione…';
   let job=jobs.get(d.id);if(!job){job=queue.then(obtain);jobs.set(d.id,job);queue=job.catch(()=>{});}
   job.then(result=>{if(!current())return;if(!result){jobs.delete(d.id);start();return;}
    if(result.skip){state.textContent='Definitivo precedente: viene scansionato solo l’ultimo mensile completo.';return;}
    state.textContent=result.pdf?'PDF elaborato pagina per pagina · originale conservato':result.cropped?'Ritagliata e migliorata automaticamente · originale conservato':'Foto intera migliorata: bordi incerti, nessun ritaglio automatico.';
    const img=node('img');img.className='auto-scan-image';img.src=result.url;img.alt=result.cropped?'Foto ritagliata e migliorata':'Foto intera migliorata, ritaglio non applicato';img.loading='lazy';
    const open=node('button','Apri scansione');open.type='button';open.className='doc-link';open.onclick=()=>preview(result.url,d);if(!result.pdf)box.prepend(img);box.append(open);
    if(result.pdf)open.onclick=()=>{if(allowed())window.location.assign(result.url);};
    if(!monthly&&documentScanStatus){const line=node('small','Scansione in attesa di archiviazione su Drive.');box.append(line);const poll=async()=>{if(!current())return;try{const r=await documentScanStatus(d.id);if(!current())return;if(r.job?.status==='done'){line.textContent='Originale e scansione verificati su Drive.';return;}line.textContent=r.job?.last_error?'Archiviazione da riprovare: '+r.job.last_error:'Archiviazione della scansione su Drive in corso…';}catch(e){if(!current())return;line.textContent='Scansione conservata nell’app. Drive in attesa: '+e.message;}const timer=setTimeout(()=>{timers.delete(timer);poll();},10000);timers.add(timer);};poll();}
    if(monthly&&monthlyStatus){const line=node('small','Originale e scansione in attesa di verifica su Drive. I settimanali restano conservati.');box.append(line);let first=true;const poll=async()=>{if(!current())return;try{const r=await monthlyStatus(first?'enqueue':'status',d.id);first=false;if(!current())return;const c=r.closure;if(c?.status==='done'){line.textContent='Originale e scansione verificati su Drive · settimanali precedenti eliminati.';if(!closedSeen.has(d.id)){closedSeen.add(d.id);onMonthClosed();}return;}line.textContent=c?.last_error?'Chiusura non completata: '+c.last_error:'Archiviazione mensile in corso. I settimanali saranno rimossi dopo le verifiche.';}catch(e){if(!current())return;line.textContent='Chiusura mensile in attesa: '+e.message;}const timer=setTimeout(()=>{timers.delete(timer);poll();},10000);timers.add(timer);};poll();}
   }).catch(e=>{jobs.delete(d.id);if(!current())return;state.textContent='Scansione non disponibile. Originale conservato. '+(e.message||'');const retry=node('button','Riprova scansione');retry.type='button';retry.className='doc-link';retry.onclick=()=>{retry.remove();start();};box.append(retry);});
  }
  // No image is processed for workers. Only the selected administrator archive is rendered.
  queueMicrotask(start);
 }
 return {render,clear};
}




