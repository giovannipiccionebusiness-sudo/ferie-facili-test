import {detectPaper,validCorners} from './scanner-core.js?v=30';
// Find continuous light-to-dark page boundaries, including low-contrast paper.
export function detectLivePaper(frame){
 const first=detectPaper(frame);if(first.detected&&first.points.every(p=>p.x>0&&p.y>0&&p.x<frame.width-1&&p.y<frame.height-1))return first;
 const {width:w,height:h,data}=frame,lum=new Float32Array(w*h);
 for(let i=0;i<lum.length;i++){const k=i*4;lum[i]=.299*data[k]+.587*data[k+1]+.114*data[k+2];}
 const at=(x,y)=>lum[Math.max(0,Math.min(h-1,Math.round(y)))*w+Math.max(0,Math.min(w-1,Math.round(x)))];
 function line(vertical,sign,low,high,from,to){
  let best=null;const offset=2;
  for(let a=-.45;a<=.45;a+=.03)for(let b=low;b<=high;b+=1.5){
   let sum=0,support=0,n=0;
   for(let t=from;t<to;t+=3){const v=a*(t-(vertical?h:w)/2)+b,x=vertical?v:t,y=vertical?t:v;if(x<3||x>w-4||y<3||y>h-4)continue;
    const inside=at(x+(vertical?sign*offset:0),y+(vertical?0:sign*offset));const outside=at(x-(vertical?sign*offset:0),y-(vertical?0:sign*offset));const far=at(x-(vertical?sign*8:0),y-(vertical?0:sign*8));const d=Math.min(inside-outside,inside-far);
    sum+=Math.max(-8,Math.min(40,d));if(d>5)support++;n++;
   }
   const score=n>12?Math.max(0,sum/n)*(support/n)**2:0;
   if(!best||score>best.score)best={a,b:b-a*(vertical?h:w)/2,score,support:support/Math.max(n,1)};
  }return best;
 }
 const left=line(true,1,4,w*.45,h*.22,h*.78),right=line(true,-1,w*.55,w-4,h*.22,h*.78),top=line(false,1,4,h*.45,w*.25,w*.75),bottom=line(false,-1,h*.55,h-4,w*.25,w*.75);
 if([left,right,top,bottom].some(l=>l.score<2.5||l.support<.48))return {detected:false,points:[]};
 const cross=(v,hz)=>{const y=(hz.a*v.b+hz.b)/(1-hz.a*v.a);return {x:v.a*y+v.b,y};};
 const points=[cross(left,top),cross(right,top),cross(right,bottom),cross(left,bottom)];
 if(!validCorners(points,w,h))return {detected:false,points:[]};
 let area=0;for(let i=0;i<4;i++)area+=points[i].x*points[(i+1)%4].y-points[(i+1)%4].x*points[i].y;
 if(area/2<w*h*.2||area/2>w*h*.96)return {detected:false,points:[]};
 return {detected:true,points};
}
