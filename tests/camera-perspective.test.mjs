import assert from 'node:assert/strict';import {isOblique,createPerspectiveGuard} from '../camera-perspective.js';
const straight=[{x:60,y:30},{x:180,y:30},{x:180,y:210},{x:60,y:210}],tilted=[{x:90,y:30},{x:150,y:30},{x:190,y:210},{x:50,y:210}];
assert.equal(isOblique(straight,240,240),false);assert.equal(isOblique(tilted,240,240),true);
const rotated=straight.map(p=>({x:120+(p.x-120)*Math.cos(.3)-(p.y-120)*Math.sin(.3),y:120+(p.x-120)*Math.sin(.3)+(p.y-120)*Math.cos(.3)}));assert.equal(isOblique(rotated,240,240),false);
assert.equal(isOblique(null,240,240),null);assert.equal(isOblique(straight.map(()=>({x:0,y:0})),240,240),null);
const g=createPerspectiveGuard();assert.equal(g.update(straight,240,240,0).allowAutomatic,true);assert.equal(g.update(tilted,240,240,100).allowAutomatic,false);assert.equal(g.update(tilted,240,240,100).showWarning,false);assert.equal(g.update(tilted,240,240,1099).showWarning,false);assert.equal(g.update(tilted,240,240,1100).showWarning,true);
assert.equal(g.update(straight,240,240,1200).allowAutomatic,false);assert.equal(g.update(straight,240,240,1799).showWarning,true);assert.equal(g.update(straight,240,240,1800).allowAutomatic,true);assert.equal(g.update(straight,240,240,1800).showWarning,false);
g.update(tilted,240,240,1900);assert.equal(g.update(straight,240,240,2000).showWarning,false);g.reset();assert.equal(g.update(straight,240,240,0).allowAutomatic,true);assert.equal(g.update(null,240,240,10).allowAutomatic,false);
console.log('PASS perspective geometry: rotation accepted; clear trapezoid rejected; invalid/missing corners not classified; immediate automatic pause; persistent warning; recovery hysteresis; reset.');
