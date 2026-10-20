
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(process.argv[2]||path.join(__dirname,'../app.js'),'utf8');
function fixture(){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',disabled:false,files:[],classList:{toggle(){},add(){}},addEventListener(){},click(){},focus(){},scrollIntoView(){}});return nodes.get(id)};
 const sandbox={document:{getElementById:get},console,Date,Set,Map,Object,JSON,String,Number,Promise,RegExp,Error,confirm:()=>true,crypto:{randomUUID:()=> 'a3333333-3333-4333-8333-333333333333'},SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'synthetic-public-key-12345'};
 vm.createContext(sandbox);
 const hooks=`
 globalThis.testHooks={
 pick,
 init(fake){sb=fake;profile={role:'worker',active:true,site:'N153'};session={user:{id:'a1111111-1111-4111-8111-111111111111'}};docs=[];refreshWorker=async()=>{};},
 getSelection:()=>selectedUpload,
 isoLocalDate
 };
 `;
 vm.runInContext(app.replace(/^import .*;$/gm,'').replace('boot().catch(err);','')+hooks,sandbox);
 get('month').value='2026-10';get('workerWeek').value='2026-10-23';get('docType').value='ferie';get('docPicker').files=[{type:'application/pdf',size:48,name:'DOCUMENTO-FITTIZIO.pdf'}];
 return {get,h:sandbox.testHooks};
}
(async()=>{
 let uploadCalls=0,payload,release;
 const f=fixture();
 f.h.init({storage:{from:()=>({upload:()=>{uploadCalls++;return new Promise(r=>release=r)},remove:async()=>({})})},from:()=>({insert:async p=>{payload=p;return {error:null}}})});
 f.get('workerWeek').value='';f.h.pick('weekly');
 assert.match(f.get('appMsg').textContent,/venerdì/);assert.equal(f.h.getSelection(),null);assert.equal(uploadCalls,0);
 f.get('workerWeek').value='2026-10-22';f.h.pick('weekly');assert.equal(f.h.getSelection(),null);
 f.get('workerWeek').value='2026-10-23';f.h.pick('weekly');
 const pending=f.get('docPicker').onchange();
 f.get('workerWeek').value='';f.get('month').value='2026-11';f.h.pick('request');
 assert.equal(f.get('updateSheet').disabled,true);
 release({error:null});await pending;
 assert.equal(payload.stage,'weekly');assert.equal(payload.week_ending,'2026-10-23');assert.equal(payload.month,'2026-10');assert.equal(payload.category,'presenze');
 assert.equal(f.get('updateSheet').disabled,false);
 const r=fixture();
 r.h.init({storage:{from:()=>({upload:async()=>({error:null})})},from:()=>({insert:async p=>{payload=p;return {error:null}}})});
 r.h.pick('request');await r.get('docPicker').onchange();assert.equal(payload.week_ending,null);assert.equal(payload.stage,'request');assert.equal(payload.category,'ferie');
 r.h.pick('final');await r.get('docPicker').onchange();assert.equal(payload.week_ending,null);assert.equal(payload.stage,'final');
 assert.equal(r.h.isoLocalDate(new Date(2026,9,23)),'2026-10-23');
 console.log('PASS: missing/non-Friday validation before upload; immutable selection during async upload; buttons restored; requests/finals omit week; local ISO dates. Synthetic file objects only; no network.');
})().catch(e=>{console.error(e);process.exitCode=1});
