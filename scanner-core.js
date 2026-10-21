// Deterministic image processing: no OCR, generated text or external services.
export function validCorners(p,w,h){if(p.length!==4||p.some(a=>!Number.isFinite(a.x)||!Number.isFinite(a.y)||a.x<0||a.y<0||a.x>w||a.y>h))return false;let area=0;for(let i=0;i<4;i++){const a=p[i],b=p[(i+1)%4],c=p[(i+2)%4];if((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)<=0)return false;area+=a.x*b.y-b.x*a.y;}return area/2>w*h*.015;}
export function detectPaper({data,width:w,height:h}){
 const count=w*h,scores=new Uint8Array(count),hist=new Uint32Array(256);
 const fallback={points:[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}],detected:false};
 // Paper is approximately neutral even in shadow. Warm wood can be bright,
 // so luminance alone incorrectly joins it to the page or loses shaded paper.
 let total=0;for(let i=0;i<count;i++){const k=i*4,r=data[k],g=data[k+1],b=data[k+2],lo=Math.min(r,g,b),hi=Math.max(r,g,b);scores[i]=Math.max(0,Math.round(lo-.55*(hi-lo)));hist[scores[i]]++;total+=scores[i];}
 let weight=0,sum=0,bestVariance=0,threshold=0;
 for(let t=0;t<255;t++){weight+=hist[t];sum+=t*hist[t];if(!weight||weight===count)continue;const delta=sum/weight-(total-sum)/(count-weight),variance=weight*(count-weight)*delta*delta;if(variance>bestVariance){bestVariance=variance;threshold=t;}}
 if(bestVariance/(count*count)<90)return fallback;
 threshold=Math.max(65,Math.min(205,threshold));
 let mask=new Uint8Array(count);for(let i=0;i<count;i++)mask[i]=scores[i]>threshold?1:0;
 // Close small gaps from printed lines, shadows and folds, preserving frame edges.
 function morph(input,dilate){const out=new Uint8Array(count);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let value=dilate?0:1;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=Math.max(0,Math.min(w-1,x+dx)),yy=Math.max(0,Math.min(h-1,y+dy));if(dilate)value|=input[yy*w+xx];else value&=input[yy*w+xx];}out[y*w+x]=value;}return out;}
 mask=morph(morph(mask,true),false);
 const seen=new Uint8Array(count),queue=new Int32Array(count);let best=[];
 for(let seed=0;seed<count;seed++){if(seen[seed]||!mask[seed])continue;let start=0,end=1;queue[0]=seed;seen[seed]=1;while(start<end){const v=queue[start++],x=v%w;for(const n of [x>0?v-1:-1,x<w-1?v+1:-1,v-w,v+w])if(n>=0&&n<count&&!seen[n]&&mask[n]){seen[n]=1;queue[end++]=n;}}if(end>best.length)best=Array.from(queue.subarray(0,end));}
 if(best.length<count*.14||best.length>count*.96)return fallback;
 let minS=Infinity,maxS=-Infinity,minD=Infinity,maxD=-Infinity,points=new Array(4);
 for(const k of best){const x=k%w,y=Math.floor(k/w),sum=x+y,diff=x-y;if(sum<minS){minS=sum;points[0]={x,y};}if(diff>maxD){maxD=diff;points[1]={x,y};}if(sum>maxS){maxS=sum;points[2]={x,y};}if(diff<minD){minD=diff;points[3]={x,y};}}
 if(!validCorners(points,w,h))return fallback;
 // Reject thin bright objects and disconnected highlights. A paper-sized component
 // must substantially fill its quadrilateral, with plausible opposite side lengths.
 let area=0;for(let i=0;i<4;i++)area+=points[i].x*points[(i+1)%4].y-points[(i+1)%4].x*points[i].y;area/=2;
 const sides=points.map((p,i)=>Math.hypot(p.x-points[(i+1)%4].x,p.y-points[(i+1)%4].y));
 if(best.length/area<.55||Math.min(...sides)<Math.min(w,h)*.16||Math.max(sides[0],sides[2])/Math.min(sides[0],sides[2])>3||Math.max(sides[1],sides[3])/Math.min(sides[1],sides[3])>3)return fallback;
 return {points,detected:true};
}
export function homography(points){
 const rows=[];for(let i=0;i<4;i++){const [u,v]=[[0,0],[1,0],[1,1],[0,1]][i],{x,y}=points[i];rows.push([u,v,1,0,0,0,-x*u,-x*v,x],[0,0,0,u,v,1,-y*u,-y*v,y]);}
 for(let c=0;c<8;c++){let pivot=c;for(let r=c+1;r<8;r++)if(Math.abs(rows[r][c])>Math.abs(rows[pivot][c]))pivot=r;[rows[c],rows[pivot]]=[rows[pivot],rows[c]];if(Math.abs(rows[c][c])<1e-10)throw Error('Ritaglio non valido. Correggi gli angoli.');const d=rows[c][c];for(let k=c;k<9;k++)rows[c][k]/=d;for(let r=0;r<8;r++)if(r!==c){const m=rows[r][c];for(let k=c;k<9;k++)rows[r][k]-=m*rows[c][k];}}
 return rows.map(r=>r[8]);
}
export function warpImage(source,points,width,height,enhance=false){
 const m=homography(points),out=new Uint8ClampedArray(width*height*4),sw=source.width,sh=source.height,src=source.data;
 for(let y=0;y<height;y++){const v=y/(height-1);for(let x=0;x<width;x++){const u=x/(width-1),z=m[6]*u+m[7]*v+1,sx=Math.max(0,Math.min(sw-1,(m[0]*u+m[1]*v+m[2])/z)),sy=Math.max(0,Math.min(sh-1,(m[3]*u+m[4]*v+m[5])/z));const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy,p=(iy*sw+ix)*4,px=(iy*sw+Math.min(sw-1,ix+1))*4,py=(Math.min(sh-1,iy+1)*sw+ix)*4,pxy=(Math.min(sh-1,iy+1)*sw+Math.min(sw-1,ix+1))*4,k=(y*width+x)*4;
 for(let c=0;c<3;c++)out[k+c]=src[p+c]*(1-fx)*(1-fy)+src[px+c]*fx*(1-fy)+src[py+c]*(1-fx)*fy+src[pxy+c]*fx*fy;
 if(enhance){const l=.299*out[k]+.587*out[k+1]+.114*out[k+2];out[k]=out[k+1]=out[k+2]=Math.max(0,Math.min(255,(l-128)*1.12+140));}out[k+3]=255;
 }}return {data:out,width,height};
}
// One A4 page, plus the exact input file as an embedded attachment.
export function makePDF(jpeg,width,height,original,mime='image/jpeg',landscape=false){
 const enc=new TextEncoder(),parts=[],offsets=[0];let length=0;const add=x=>{const b=typeof x==='string'?enc.encode(x):x;parts.push(b);length+=b.length;};const obj=(n,content,bytes)=>{offsets[n]=length;add(n+' 0 obj\n'+content);if(bytes){add('\nstream\n');add(bytes);add('\nendstream');}add('\nendobj\n');};
 add('%PDF-1.7\n%FFFF\n');obj(1,'<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [(foto-originale) 7 0 R] >> >> >>');obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');const pw=landscape?841.89:595.28,ph=landscape?595.28:841.89;
 obj(3,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
 obj(4,`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`,jpeg);
 const stream=enc.encode(`q\n${pw} 0 0 ${ph} 0 0 cm\n/Im0 Do\nQ`);obj(5,`<< /Length ${stream.length} >>`,stream);
 obj(6,`<< /Type /EmbeddedFile /Subtype /${mime.replaceAll('/','#2F')} /Length ${original.length} >>`,original);
 const ext=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';obj(7,`<< /Type /Filespec /F (foto-originale.${ext}) /Desc (Foto originale non modificata) /EF << /F 6 0 R >> >>`);
 const xref=length;add('xref\n0 8\n0000000000 65535 f \n');for(let i=1;i<=7;i++)add(String(offsets[i]).padStart(10,'0')+' 00000 n \n');add(`trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);return new Blob(parts,{type:'application/pdf'});
}
