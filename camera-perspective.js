// Geometry is measured in frame pixels: normalized x/y have different scales.
// This detects clear perspective distortion, not the phone's physical angle.
export function isOblique(points,width,height){
 if(!Array.isArray(points)||points.length!==4||!(width>0&&height>0)||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
 const edges=points.map((p,i)=>({x:points[(i+1)%4].x-p.x,y:points[(i+1)%4].y-p.y})),lengths=edges.map(e=>Math.hypot(e.x,e.y));
 if(lengths.some(n=>n<4))return null;
 const crosses=edges.map((e,i)=>e.x*edges[(i+1)%4].y-e.y*edges[(i+1)%4].x);
 if(crosses.some(c=>!c)||!crosses.every(c=>Math.sign(c)===Math.sign(crosses[0])))return null;
 const opposite=Math.max(lengths[0]/lengths[2],lengths[2]/lengths[0],lengths[1]/lengths[3],lengths[3]/lengths[1]);
 const skew=Math.max(...edges.map((e,i)=>Math.abs(e.x*edges[(i+1)%4].x+e.y*edges[(i+1)%4].y)/(lengths[i]*lengths[(i+1)%4])));
 return opposite>1.45||skew>.38;
}
export function createPerspectiveGuard(){let badSince=null,goodSince=null,warning=false;return {reset(){badSince=goodSince=null;warning=false;},update(points,width,height,now){const bad=isOblique(points,width,height);if(bad===null){badSince=goodSince=null;warning=false;return {oblique:false,showWarning:false,allowAutomatic:false};}if(bad){goodSince=null;if(badSince===null)badSince=now;if(now-badSince>=1000)warning=true;return {oblique:true,showWarning:warning,allowAutomatic:false};}if(badSince!==null||warning){if(goodSince===null)goodSince=now;if(now-goodSince<600)return {oblique:false,showWarning:warning,allowAutomatic:false};}badSince=goodSince=null;warning=false;return {oblique:false,showWarning:false,allowAutomatic:true};}};}
