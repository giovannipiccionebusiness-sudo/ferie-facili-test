import {detectLivePaper} from './live-detector.js?v=39';
import {warpImage,makePDF} from './scanner-core.js?v=30';
export function stableDocument(previous,current){
 return !!previous&&!!current&&current.every((p,i)=>Math.hypot(p.x-previous[i].x,p.y-previous[i].y)<.012);
}
export function openDocumentCamera(){
 return new Promise(resolve=>{
 const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 const dialog=el('dialog'),title=el('h2','Scansiona documento · TEST 39'),status=el('p','Scegli come acquisire il documento.'),stage=el('div'),video=el('video'),overlay=el('canvas'),preview=el('img'),actions=el('div');
 dialog.className='live-document-camera';dialog.setAttribute('aria-label','Acquisizione documento');status.setAttribute('role','status');video.autoplay=true;video.muted=true;video.playsInline=true;preview.alt='Anteprima del documento ritagliato';
 const start=el('button','Apri fotocamera'),snap=el('button','Scatta ora'),use=el('button','Usa questa scansione'),retry=el('button','Ripeti foto'),gallery=el('button','Galleria o PDF'),close=el('button','Chiudi');
 const automatic=el('input'),label=el('label',' Scatto automatico');automatic.type='checkbox';automatic.checked=true;label.prepend(automatic);automatic.style.width='auto';
 for(const b of [start,snap,use,retry,gallery,close])b.type='button';actions.append(start,snap,use,retry,gallery,close);stage.append(video,overlay,preview);dialog.append(title,status,stage,label,actions);document.body.append(dialog);
 let stream=null,closed=false,timer=null,epoch=0,points=null,previous=null,stableSince=0,busy=false,file=null,url=null;
 const sample=el('canvas'),ctx=sample.getContext('2d',{willReadFrequently:true});
 function stop(){epoch++;clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;}
 function finish(value){if(closed)return;closed=true;stop();if(url)URL.revokeObjectURL(url);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',abandon);dialog.close();dialog.remove();resolve(value);}
 function abandon(){finish(null);}function hidden(){if(document.hidden)finish(null);}
 document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',abandon);
 function view(mode){start.hidden=mode!=='choose';snap.hidden=mode!=='camera';use.hidden=retry.hidden=mode!=='preview';video.hidden=overlay.hidden=mode!=='camera';preview.hidden=mode!=='preview';label.hidden=mode!=='camera';}
 async function begin(){stop();const token=epoch;view('choose');start.disabled=true;status.textContent='Consenti l’accesso alla fotocamera…';
  try{if(!navigator.mediaDevices?.getUserMedia)throw Error();const incoming=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1440}}});if(closed||token!==epoch){incoming.getTracks().forEach(t=>t.stop());return;}stream=incoming;video.srcObject=stream;await video.play();if(closed||token!==epoch)return;points=previous=null;stableSince=0;view('camera');status.textContent='Inquadra tutti e quattro i bordi su uno sfondo scuro.';tick();}
  catch{if(!closed){stop();view('choose');status.textContent='Fotocamera non disponibile o permesso negato. Puoi scegliere Galleria o PDF e usare la fotocamera del telefono.';}}
  finally{start.disabled=false;}
 }
 function tick(){if(closed||!stream||busy)return;
  try{if(video.videoWidth&&video.readyState>=2){sample.width=240;sample.height=Math.round(240*video.videoHeight/video.videoWidth);ctx.drawImage(video,0,0,sample.width,sample.height);const found=detectLivePaper(ctx.getImageData(0,0,sample.width,sample.height));
   const normalized=found.detected?found.points.map(p=>({x:p.x/sample.width,y:p.y/sample.height})):null;
   points=normalized&&normalized.every(p=>p.x>0&&p.x<1&&p.y>0&&p.y<1)?normalized:null;
   overlay.width=sample.width;overlay.height=sample.height;const draw=overlay.getContext('2d');draw.clearRect(0,0,overlay.width,overlay.height);
   if(points){draw.beginPath();points.forEach((p,i)=>draw[i?'lineTo':'moveTo'](p.x*overlay.width,p.y*overlay.height));draw.closePath();draw.fillStyle='rgba(30,144,255,.18)';draw.strokeStyle='#168cff';draw.lineWidth=2;draw.fill();draw.stroke();
    if(!stableDocument(previous,points))stableSince=performance.now();status.textContent=automatic.checked?'Documento trovato. Resta immobile…':'Documento trovato. Premi Scatta ora.';
    if(automatic.checked&&performance.now()-stableSince>2000){capture();return;}
   }else{stableSince=performance.now();status.textContent='Bordi non individuati. Allontana leggermente il telefono e inquadra il foglio al centro, con buona luce.';}previous=points;
  }}catch{points=previous=null;stableSince=performance.now();status.textContent='Attendo un’immagine nitida…';}timer=setTimeout(tick,300);
 }
 async function capture(){if(busy||!stream||!video.videoWidth)return;busy=true;snap.disabled=true;clearTimeout(timer);status.textContent='Preparazione anteprima…';
  try{const source=el('canvas'),scale=Math.min(1,2000/Math.max(video.videoWidth,video.videoHeight));source.width=Math.round(video.videoWidth*scale);source.height=Math.round(video.videoHeight*scale);const sc=source.getContext('2d');sc.drawImage(video,0,0,source.width,source.height);const corners=points?.map(p=>({x:p.x*source.width,y:p.y*source.height}));stop();const original=await new Promise(r=>source.toBlob(r,'image/jpeg',.94));if(!original)throw Error('Foto non acquisita.');
   if(corners){const top=Math.hypot(corners[1].x-corners[0].x,corners[1].y-corners[0].y),side=Math.hypot(corners[3].x-corners[0].x,corners[3].y-corners[0].y);const landscape=top>side;const w=landscape?1754:1240,h=landscape?1240:1754;const result=warpImage(sc.getImageData(0,0,source.width,source.height),corners,w,h,true);const output=el('canvas');output.width=w;output.height=h;output.getContext('2d').putImageData(new ImageData(result.data,w,h),0,0);const jpeg=await new Promise(r=>output.toBlob(r,'image/jpeg',.92));if(!jpeg)throw Error('Ritaglio non riuscito.');file=new File([makePDF(new Uint8Array(await jpeg.arrayBuffer()),w,h,new Uint8Array(await original.arrayBuffer()),'image/jpeg',landscape)],'documento-scansionato.pdf',{type:'application/pdf'});if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(jpeg);status.textContent='Controlla i bordi e la leggibilità. La foto originale è conservata come allegato nel PDF. Il documento non è ancora inviato.';
   }else{file=new File([original],'foto-documento.jpg',{type:'image/jpeg'});if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(original);status.textContent='Bordi non riconosciuti: questa è la foto intera. Ripeti oppure usa la foto. Il documento non è ancora inviato.';}
   if(!closed){preview.src=url;view('preview');}
  }catch(e){if(!closed){view('choose');status.textContent=e.message+' Riprova oppure scegli un file.';}}
  finally{busy=false;snap.disabled=false;}
 }
 start.onclick=retry.onclick=begin;snap.onclick=capture;use.onclick=()=>finish(file);gallery.onclick=()=>finish('gallery');close.onclick=()=>finish(null);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});view('choose');dialog.showModal();
 });
}
