import assert from 'node:assert/strict';
import {detectPaper,validCorners,homography,warpImage,makePDF} from '../scanner-core.js';
const rect=[{x:0,y:0},{x:10,y:0},{x:10,y:20},{x:0,y:20}];
assert.ok(validCorners(rect,10,20));assert.ok(!validCorners([rect[0],rect[2],rect[1],rect[3]],10,20));assert.ok(!validCorners(rect.map(p=>({x:p.x+1,y:p.y})),10,20));
const points=[{x:20,y:10},{x:90,y:18},{x:98,y:130},{x:7,y:120}],m=homography(points);
for(let i=0;i<4;i++){const [u,v]=[[0,0],[1,0],[1,1],[0,1]][i],z=m[6]*u+m[7]*v+1;assert.ok(Math.abs((m[0]*u+m[1]*v+m[2])/z-points[i].x)<1e-7);assert.ok(Math.abs((m[3]*u+m[4]*v+m[5])/z-points[i].y)<1e-7);}
const width=100,height=140,data=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const k=(y*width+x)*4;data[k]=data[k+1]=data[k+2]=(x>15&&x<85&&y>10&&y<130)?245:60;data[k+3]=255;}
const detected=detectPaper({data,width,height});assert.ok(detected.detected);assert.ok(detected.points[0].x>=15);const full=new Uint8ClampedArray(data.length).fill(255);assert.equal(detectPaper({data:full,width,height}).detected,false);
const small={width:2,height:2,data:new Uint8ClampedArray([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255])};const p=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];const warped=warpImage(small,p,2,2);assert.deepEqual([...warped.data],[...small.data]);const gray=warpImage(small,p,2,2,true);assert.equal(gray.data[0],gray.data[1]);assert.equal(gray.data[1],gray.data[2]);
const pdf=makePDF(new Uint8Array([1,2]),2,2,new Uint8Array([6,7,8]));const text=new TextDecoder().decode(await pdf.arrayBuffer());assert.ok(text.startsWith('%PDF-1.7'));assert.match(text,/\/MediaBox \[0 0 595.28 841.89\]/);assert.match(text,/EmbeddedFiles/);assert.match(text,/startxref/);
console.log('PASS: convex crop checks, projective mapping, bright-paper detection and safe fallback, pixel sampling, grayscale and PDF construction.');
