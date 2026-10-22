import {makeMultiPDF} from './multipage.js?v=30';
// PDF.js renders locally; document bytes are never sent to a conversion service.
export async function scanPDF(blob,scanPhoto,onProgress=()=>{}){
 const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');
 pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
 const task=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false}),pages=[];let pdf,cropped=true;
 try{pdf=await task.promise;if(pdf.numPages>10)throw Error('PDF con più di 10 pagine: conserva l’originale e dividi il documento per la scansione.');
  const attachments=await pdf.getAttachments();const originals=Object.values(attachments||{}).filter(a=>/^pagina-originale-[0-9]+\.(jpg|png|webp)$/.test(a.filename)).sort((a,b)=>Number(a.filename.match(/[0-9]+/)[0])-Number(b.filename.match(/[0-9]+/)[0]));const useOriginals=originals.length===pdf.numPages&&originals.every((a,i)=>a.filename.startsWith('pagina-originale-'+(i+1)+'.'));
  for(let n=1;n<=pdf.numPages;n++){onProgress(n,pdf.numPages);if(useOriginals){const a=originals[n-1],mime=a.filename.endsWith('.png')?'image/png':a.filename.endsWith('.webp')?'image/webp':'image/jpeg',result=await scanPhoto(new Blob([a.content],{type:mime}));cropped=cropped&&result.cropped;pages.push({bytes:new Uint8Array(await result.file.arrayBuffer()),width:result.width,height:result.height});continue;}const page=await pdf.getPage(n),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(2.5,1800/Math.max(base.width,base.height))}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const ctx=canvas.getContext('2d');await page.render({canvasContext:ctx,viewport,background:'white'}).promise;
   const image=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.94));if(!image)throw Error('Pagina PDF non leggibile.');const result=await scanPhoto(image);cropped=cropped&&result.cropped;pages.push({bytes:new Uint8Array(await result.file.arrayBuffer()),width:result.width,height:result.height});canvas.width=canvas.height=1;page.cleanup();
  }return {file:makeMultiPDF(pages),cropped};
 }finally{await task.destroy();}
}

