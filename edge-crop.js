import {validCorners} from './scanner-core.js?v=30';
// Straight border evidence and repeated sleeve perforations, not text recognition.
export function edgePaper({data,width:w,height:h}){
 const lum=new Float32Array(w*h),paper=new Float32Array(w*h);for(let i=0;i<lum.length;i++){const k=i*4,r=data[k],g=data[k+1],b=data[k+2];lum[i]=.299*r+.587*g+.114*b;paper[i]=Math.min(r,g,b)-.5*(Math.max(r,g,b)-Math.min(r,g,b));}
 function at(a,x,y){return a[Math.max(0,Math.min(h-1,Math.round(y)))*w+Math.max(0,Math.min(w-1,Math.round(x)))];}
 // A transparent punched sleeve has a column of small, repeated dark holes.
 const seen=new Uint8Array(w*h),holes=[];for(let y=0;y<h;y++)for(let x=Math.floor(w*.83);x<w;x++){const k=y*w+x;if(seen[k]||lum[k]>65)continue;const q=[k];seen[k]=1;let minX=x,maxX=x,minY=y,maxY=y;for(let i=0;i<q.length;i++){const v=q[i],xx=v%w,yy=Math.floor(v/w);minX=Math.min(minX,xx);maxX=Math.max(maxX,xx);minY=Math.min(minY,yy);maxY=Math.max(maxY,yy);for(const n of [xx>0?v-1:-1,xx<w-1?v+1:-1,v-w,v+w])if(n>=0&&n<w*h&&!seen[n]&&lum[n]<65){seen[n]=1;q.push(n);}}const bw=maxX-minX+1,bh=maxY-minY+1;if(q.length>6&&bw>=3&&bw<w*.07&&bh>=4&&bh<h*.09&&maxX<w-2&&minX>w*.84&&bw/bh>.18&&bw/bh<2.5)holes.push({x:(minX+maxX)/2,y:(minY+maxY)/2,left:minX});}
 let sleeve=null;if(holes.length>=4){const my=holes.reduce((s,p)=>s+p.y,0)/holes.length,mx=holes.reduce((s,p)=>s+p.x,0)/holes.length;const den=holes.reduce((s,p)=>s+(p.y-my)**2,0),a=holes.reduce((s,p)=>s+(p.y-my)*(p.x-mx),0)/den,b=mx-a*my;const good=holes.filter(p=>Math.abs(p.x-a*p.y-b)<w*.025);if(good.length>=4&&Math.max(...good.map(p=>p.y))-Math.min(...good.map(p=>p.y))>h*.4)sleeve={a,b:b-w*.05};}
 function line(vertical,sign,low,high,from,to){let best={score:-1,a:0,b:0};const maxSlope=vertical?.25:.15;for(let a=-maxSlope;a<=maxSlope;a+=.01)for(let b=low;b<=high;b+=1){let sum=0,n=0,support=0;for(let t=from;t<to;t+=2){const v=a*t+b,x=vertical?v:t,y=vertical?t:v;if(x<2||x>w-3||y<2||y>h-3)continue;const inside=at(paper,x+(vertical?sign*3:0),y+(vertical?0:sign*3)),outside=at(paper,x-(vertical?sign*3:0),y-(vertical?0:sign*3));const grad=inside-outside;if(inside<80)continue;sum+=Math.max(0,Math.min(32,grad));if(grad>8)support++;n++;}const score=n>10?sum/n*(support/n):0;if(score>best.score)best={score,a,b};}return best;}
 const left=line(true,1,-w*.15,w*.27,h*.2,h*.88),right=sleeve?{...sleeve,score:10}:line(true,-1,w*.65,w*1.1,h*.2,h*.88);
 const top=line(false,1,-h*.08,h*.23,w*.18,w*.8),bottom=line(false,-1,h*.72,h*1.08,w*.18,w*.8);
 function cross(v,hz){const y=(hz.a*v.b+hz.b)/(1-hz.a*v.a),x=v.a*y+v.b;return {x:Math.max(0,Math.min(w,x)),y:Math.max(0,Math.min(h,y))};}
 const points=[cross(left,top),cross(right,top),cross(right,bottom),cross(left,bottom)];if(!validCorners(points,w,h)||Math.min(left.score,right.score,top.score,bottom.score)<1.5)return null;
 let area=0;for(let i=0;i<4;i++)area+=points[i].x*points[(i+1)%4].y-points[(i+1)%4].x*points[i].y;area/=2;if(area<w*h*.3)return null;
 let white=0,total=0;for(let v=.05;v<.95;v+=.07)for(let u=.05;u<.95;u+=.07){const x=(1-v)*((1-u)*points[0].x+u*points[1].x)+v*((1-u)*points[3].x+u*points[2].x),y=(1-v)*((1-u)*points[0].y+u*points[1].y)+v*((1-u)*points[3].y+u*points[2].y);if(at(paper,x,y)>95)white++;total++;}if(white/total<.7)return null;
 return {points,detected:true,sleeve:!!sleeve};
}


