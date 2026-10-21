
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(process.argv[2]||path.join(__dirname,'../app.js'),'utf8');
const worker='a1111111-1111-4111-8111-111111111111';
function fixture(shared={session:new Map(),drafts:new Map()}){
 const nodes=new Map();
 function element(){return {value:'',textContent:'',disabled:false,files:[],style:{},classList:{toggle(){},add(){},remove(){}},addEventListener(){},click(){},focus(){},scrollIntoView(){},setAttribute(){},removeAttribute(){},append(){},prepend(){},remove(){}};}
 const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 const sandbox={document:{getElementById:get,createElement:element,addEventListener(){}},window:{addEventListener(){}},setTimeout:fn=>{sandbox.cameraTimer=fn;return 1;},clearTimeout(){},console,Date,Set,Map,Object,JSON,String,Number,Promise,RegExp,Error,confirm:()=>true,
 sessionStorage:{setItem:(k,v)=>shared.session.set(k,v),getItem:k=>shared.session.get(k)||null,removeItem:k=>shared.session.delete(k)},
 saveUploadDraft:async d=>shared.drafts.set(d.worker_id,d),readUploadDraft:async id=>shared.drafts.get(id)||null,deleteUploadDraft:async id=>shared.drafts.delete(id),
 crypto:{randomUUID:()=> 'a3333333-3333-4333-8333-333333333333'},SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'synthetic-public-key-12345'};
 vm.createContext(sandbox);
 const hooks=`
 globalThis.h={
 pick,restoreUploadState,sendUploadDraft,readCameraSelection,checkCameraReturn,cameraWarning:()=>cameraRetryPanel,
 init(fake){sb=fake;profile={id:'${worker}',role:'worker',active:true,site:'N153'};session={user:{id:'${worker}'}};docs=[];refreshWorker=async()=>{};},
 progress:()=>uploadStatusText?.textContent,selected:()=>selectedUpload,draft:()=>pendingDraft,isoLocalDate
 };`;
 vm.runInContext(source.replace(/^import .*;$/gm,'').replace('const appReady=boot().catch(err);','const appReady=Promise.resolve();')+hooks,sandbox);
 get('month').value='2026-10';get('workerWeek').value='2026-10-23';get('docType').value='ferie';
 get('docPicker').files=[{type:'application/pdf',size:48,name:'DOCUMENTO-FITTIZIO.pdf'}];
 return {get,h:sandbox.h,shared,timer:()=>sandbox.cameraTimer?.()};
}
function backend({upload=async()=>({error:null}),insert=async()=>({error:null}),exists=false}={}){
 return {storage:{from:()=>({upload})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:exists?{id:'existing'}:null,error:null})})}),insert})};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 let payload,release,releaseSave,uploads=0;
 const f=fixture();f.h.init(backend({upload:()=>{uploads++;return new Promise(r=>release=r);},insert:async p=>{payload=p;return new Promise(resolve=>releaseSave=resolve);}}));
 f.get('workerWeek').value='';f.h.pick('weekly');assert.match(f.get('appMsg').textContent,/venerdì/);assert.equal(f.h.selected(),null);
 f.get('workerWeek').value='2026-10-22';f.h.pick('weekly');assert.equal(f.h.selected(),null);assert.equal(uploads,0);
 f.get('workerWeek').value='2026-10-23';f.h.pick('weekly');
 const running=f.get('docPicker').onchange();await tick();
 f.get('workerWeek').value='';f.get('month').value='2026-11';f.h.pick('request');
 assert.equal(f.get('updateSheet').disabled,true);assert.equal(f.shared.drafts.size,1);
 release({error:null});await tick();assert.match(f.h.progress(),/Salvataggio/);assert.doesNotMatch(f.h.progress(),/caricato correttamente/);releaseSave({error:null});await running;assert.match(f.h.progress(),/100%/);
 assert.equal(payload.stage,'weekly');assert.equal(payload.week_ending,'2026-10-23');assert.equal(payload.month,'2026-10');assert.equal(f.shared.drafts.size,0);
 assert.equal(f.get('updateSheet').disabled,false);
 const r=fixture();r.h.init(backend({insert:async p=>{payload=p;return {error:null};}}));
 r.h.pick('request');await r.get('docPicker').onchange();assert.equal(payload.week_ending,null);assert.equal(payload.stage,'request');
 r.h.pick('final');await r.get('docPicker').onchange();assert.equal(payload.week_ending,null);assert.equal(payload.stage,'final');
 const before=fixture();before.h.init(backend());before.h.pick('weekly');
 const after=fixture(before.shared);after.h.init(backend());after.get('workerWeek').value='';
 await after.h.restoreUploadState();assert.equal(after.h.selected().week,'2026-10-23');assert.equal(after.h.selected().stage,'weekly');assert.ok(after.h.cameraWarning(),'Reload without a received photo must show a retry alert');
 assert.equal(after.h.readCameraSelection('other-worker'),null);
 const cancelled=fixture();cancelled.h.init(backend());cancelled.h.pick('weekly');cancelled.get('docPicker').files=[];cancelled.h.checkCameraReturn();cancelled.timer();assert.ok(cancelled.h.cameraWarning(),'Return from camera without a file must show an alert');
 // Failed transfer retains the photo; a simulated browser reload can resume with the same UUID.
 const offline=fixture();offline.h.init(backend({upload:async()=>({error:new Error('SYNTHETIC offline')})}));
 offline.h.pick('weekly');await offline.get('docPicker').onchange();assert.equal(offline.shared.drafts.size,1);
 const saved=offline.h.draft(),resumed=fixture(offline.shared);let posted;
 resumed.h.init(backend({upload:async()=>({error:{statusCode:409,message:'already exists'}}),insert:async p=>{posted=p;return {error:null};}}));
 await resumed.h.restoreUploadState();await resumed.h.sendUploadDraft(resumed.h.draft());
 assert.equal(posted.id,saved.id);assert.equal(resumed.shared.drafts.size,0);
 // An acknowledged database row after a lost response must not be uploaded or inserted twice.
 const duplicate=fixture();duplicate.h.init(backend({exists:true,upload:async()=>{throw Error('duplicate upload');},insert:async()=>{throw Error('duplicate insert');}}));
 await duplicate.h.sendUploadDraft(saved);assert.equal(duplicate.h.draft(),null);
 assert.equal(r.h.isoLocalDate(new Date(2026,9,23)),'2026-10-23');
 console.log('PASS: upload validation, immutable selection, draft checkpoint/reload/retry, stable UUID, duplicate prevention, account isolation, request/final week, ISO dates. Synthetic file objects and mocked network/storage only.');
})().catch(e=>{console.error(e);process.exitCode=1;});
