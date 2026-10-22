// Deterministic illumination correction: never synthesizes text or signatures.
// Estimate paper colour from upper percentiles, so dark strokes do not set white.
export function cleanPaper({data,width,height}){
 const size=64,cols=Math.ceil(width/size),rows=Math.ceil(height/size),bg=new Float32Array(cols*rows*3);
 for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){
  const hist=[new Uint32Array(256),new Uint32Array(256),new Uint32Array(256)];let count=0;
  for(let y=gy*size;y<Math.min(height,(gy+1)*size);y+=2)for(let x=gx*size;x<Math.min(width,(gx+1)*size);x+=2){const k=(y*width+x)*4;for(let c=0;c<3;c++)hist[c][data[k+c]]++;count++;}
  for(let c=0;c<3;c++){let n=0,value=255;for(let v=0;v<256;v++){n+=hist[c][v];if(n>=count*.85){value=v;break;}}bg[(gy*cols+gx)*3+c]=Math.max(90,value);}
 }
 const out=new Uint8ClampedArray(data.length);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const fx=Math.max(0,Math.min(cols-1,(x+.5)/size-.5)),fy=Math.max(0,Math.min(rows-1,(y+.5)/size-.5));const x0=Math.floor(fx),y0=Math.floor(fy),x1=Math.min(cols-1,x0+1),y1=Math.min(rows-1,y0+1),tx=fx-x0,ty=fy-y0,k=(y*width+x)*4;
  const values=[];for(let c=0;c<3;c++){const top=bg[(y0*cols+x0)*3+c]*(1-tx)+bg[(y0*cols+x1)*3+c]*tx,bottom=bg[(y1*cols+x0)*3+c]*(1-tx)+bg[(y1*cols+x1)*3+c]*tx;const white=top*(1-ty)+bottom*ty;values[c]=Math.min(255,data[k+c]*255/white);}
  // A gentle white shoulder keeps faint pencil and printed table rules visible.
  const spread=Math.max(...values)-Math.min(...values);for(let c=0;c<3;c++){let v=values[c];if(spread<18&&v>238)v=238+(v-238)*1.2;out[k+c]=v;}out[k+3]=data[k+3];
 }
 return {data:out,width,height};
}


