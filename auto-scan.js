import {detectPaper,warpImage} from './scanner-core.js?v=15';
// Colour-preserving deterministic processing. No generated text or OCR.
export async function autoScanPhoto(blob){
 let image;const url=URL.createObjectURL(blob);
 try{if(typeof createImageBitmap==='function')image=await createImageBitmap(blob,{resizeWidth:1400,resizeQuality:'high'});else{image=new Image();image.src=url;await image.decode();}
  const src=document.createElement('canvas'),scale=Math.min(1,1800/Math.max(image.width,image.height));src.width=Math.round(image.width*scale);src.height=Math.round(image.height*scale);const ctx=src.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,src.width,src.height);ctx.drawImage(image,0,0,src.width,src.height);
  const small=document.createElement('canvas');small.width=320;small.height=Math.max(1,Math.round(src.height/src.width*320));small.getContext('2d').drawImage(src,0,0,small.width,small.height);const found=detectPaper(small.getContext('2d').getImageData(0,0,small.width,small.height));
  const points=found.points.map(p=>({x:p.x/small.width*src.width,y:p.y/small.height*src.height}));
  // Conservative guard: an ambiguous candidate touching the frame is never cropped.
  const cropped=found.detected&&points.every(p=>p.x>src.width*.012&&p.x<src.width*.988&&p.y>src.height*.012&&p.y<src.height*.988);
  const side=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),landscape=cropped?(side(points[0],points[1])+side(points[2],points[3]))>(side(points[0],points[3])+side(points[1],points[2])):src.width>src.height;
  const page=document.createElement('canvas');page.width=landscape?1800:1273;page.height=landscape?1273:1800;const out=page.getContext('2d');out.fillStyle='white';out.fillRect(0,0,page.width,page.height);
  if(cropped){const pixels=warpImage(ctx.getImageData(0,0,src.width,src.height),points,page.width,page.height,false);out.putImageData(new ImageData(pixels.data,page.width,page.height),0,0);}
  else{const scale=Math.min(page.width/src.width,page.height/src.height);out.drawImage(src,(page.width-src.width*scale)/2,(page.height-src.height*scale)/2,src.width*scale,src.height*scale);}
  const pixels=out.getImageData(0,0,page.width,page.height);for(let k=0;k<pixels.data.length;k+=4)for(let c=0;c<3;c++)pixels.data[k+c]=Math.max(0,Math.min(255,(pixels.data[k+c]-128)*1.06+136));out.putImageData(pixels,0,0);
  const file=await new Promise(r=>page.toBlob(r,'image/jpeg',.93));if(!file)throw Error('Impossibile preparare la scansione.');return {file,cropped,width:page.width,height:page.height};
 }finally{image?.close?.();URL.revokeObjectURL(url);}
}
export function createAutoArchiveScanner({client,allowed,openOriginal}){
 let queue=Promise.resolve(),epoch=0;const jobs=new Map(),urls=new Set();
 const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 function clear(){epoch++;jobs.clear();for(const url of urls)URL.revokeObjectURL(url);urls.clear();document.querySelectorAll('.auto-scan-image').forEach(i=>i.removeAttribute('src'));document.querySelectorAll('.auto-scan-dialog').forEach(d=>{d.close();d.remove();});}
 function preview(url,d){if(!allowed())return;const dialog=node('dialog');dialog.className='auto-scan-dialog';const img=node('img');img.src=url;img.alt='Foto ritagliata e migliorata';const b=node('button','Chiudi');b.type='button';b.onclick=()=>{dialog.close();dialog.remove();};dialog.append(node('h3','Scansione automatica'),img,b);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();}
 function render(d,container){
  const box=node('div');box.className='auto-scan';container.append(box);
  const original=node('button','Apri originale');original.className='doc-link';original.type='button';original.onclick=()=>{if(allowed())openOriginal(d);};
  if(!/\.(jpe?g|png|webp)$/i.test(d.file_path||d.file_name)){box.append(node('small','PDF originale: nessuna elaborazione automatica.'),original);return;}
  const state=node('small','In attesa della scansione automatica…');box.append(state,original);const generation=epoch;
  function current(){return generation===epoch&&allowed()&&box.isConnected;}
  async function obtain(){
   if(!current())return null;
   const db=client();const r=await db.from('test_document_scans').select('*').eq('document_id',d.id).maybeSingle();if(r.error)throw r.error;
   if(!current())return null;
   let row=r.data?.source_path===d.file_path?r.data:null,blob;
   if(row){const saved=await db.storage.from('document-scans-test').download(row.file_path);if(!saved.error)blob=saved.data;}
   if(!blob){state.textContent='Ritaglio e miglioramento automatici in corso…';const src=await db.storage.from('private-documents').download(d.file_path);if(src.error)throw src.error;if(!current())return null;
    const result=await autoScanPhoto(src.data);if(!current())return null;blob=result.file;
    const path=d.id+'/auto-v1.jpg',upload=await db.storage.from('document-scans-test').upload(path,blob,{contentType:'image/jpeg',upsert:true});if(upload.error)throw upload.error;if(!current())return null;
    row={document_id:d.id,source_path:d.file_path,file_path:path,cropped:result.cropped};const save=await db.from('test_document_scans').upsert(row,{onConflict:'document_id'});if(save.error)throw save.error;
   }
   if(!current())return null;const url=URL.createObjectURL(blob);urls.add(url);return {url,cropped:row.cropped};
  }
  function start(){if(!current())return;state.textContent='Preparazione della scansione…';
   let job=jobs.get(d.id);if(!job){job=queue.then(obtain);jobs.set(d.id,job);queue=job.catch(()=>{});}
   job.then(result=>{if(!current())return;if(!result){jobs.delete(d.id);start();return;}
    state.textContent=result.cropped?'Ritagliata e migliorata automaticamente · originale conservato':'Foto intera migliorata: bordi incerti, nessun ritaglio automatico.';
    const img=node('img');img.className='auto-scan-image';img.src=result.url;img.alt=result.cropped?'Foto ritagliata e migliorata':'Foto intera migliorata, ritaglio non applicato';img.loading='lazy';
    const open=node('button','Apri scansione');open.type='button';open.className='doc-link';open.onclick=()=>preview(result.url,d);box.prepend(img);box.append(open);
   }).catch(e=>{jobs.delete(d.id);if(!current())return;state.textContent='Scansione non disponibile. Originale conservato. '+(e.message||'');const retry=node('button','Riprova scansione');retry.type='button';retry.className='doc-link';retry.onclick=()=>{retry.remove();start();};box.append(retry);});
  }
  // No image is processed for workers. Only the selected administrator archive is rendered.
  queueMicrotask(start);
 }
 return {render,clear};
}
