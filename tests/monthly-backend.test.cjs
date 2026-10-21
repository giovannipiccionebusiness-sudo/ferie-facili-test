// Run with Node 24+ (built-in TypeScript type stripping).
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');const {stripTypeScriptTypes}=require('node:module');
const source=fs.readFileSync(__dirname+'/../supabase/functions/monthly-presence-archive/index.ts','utf8').replace(/import \{ createClient \} from .*?;\n/,'');
const output={outputText:stripTypeScriptTypes(source+'\nglobalThis.runMonthly=processMonthly;')};
async function scenario(mode){
 const bytes=new TextEncoder().encode('DOCUMENTO FITTIZIO'),hash=crypto.createHash('sha256').update(bytes).digest('hex'),events=[];
 const original={status:mode==='waiting'?'pending':'archived',google_file_id:'original-drive',sha256:hash};const job={document_id:'final-fake',google_scan_id:null,manifest:[{id:'weekly-fake',path:'worker/weekly.jpeg',google_id:'weekly-drive',sha256:hash,done:false}]};
 if(mode==='batch')job.manifest=Array.from({length:5},(_,i)=>({id:'weekly-fake-'+i,path:'worker/weekly-'+i+'.jpeg',google_id:'weekly-drive-'+i,sha256:hash,done:false}));
 let claimed=false,stored={...job},scanExists=false;const trashed=new Set();
 function value(table){return table==='drive_credentials'?{admin_id:'admin',refresh_token:'fake'}:table==='profiles'?{active:true,role:'admin'}:table==='documents'?{id:'final-fake',worker_id:'worker',month:'2026-10',category:'presenze',stage:'final',review_status:'verified',file_path:'worker/final.jpeg'}:table==='test_document_scans'?{source_path:'worker/final.jpeg',file_path:'final-fake/auto-v2.jpg'}:original;}
 const db={from(table){let patch;return {select(){return this},eq(){return this},update(p){patch=p;return this},async single(){if(table==='test_monthly_closures'&&patch){Object.assign(stored,patch);return {data:stored,error:null}}return {data:value(table),error:null}},async maybeSingle(){return {data:value(table),error:null}},then(resolve){if(table==='test_monthly_closures'&&patch)Object.assign(stored,patch);resolve({data:[],error:null})}}},storage:{from(bucket){return {async download(){return {data:new Blob([bytes],{type:'image/jpeg'}),error:null}},async remove(paths){events.push('remove:'+bucket);return {data:paths,error:null}}}}},async rpc(name){if(name==='test_monthly_claim'){if(original.status!=='archived')return {data:null,error:null};claimed=true;return {data:{lease:'lease-fake',job:structuredClone(stored)},error:null}}if(name==='test_monthly_guard')return {data:mode!=='stale',error:null};if(name==='test_monthly_finish'){events.push('finish-db');assert.ok(stored.pair_verified_at);assert.ok(stored.manifest.every(x=>x.done));return {data:1,error:null}}throw Error('Unexpected RPC '+name)}};
 const fetch=async(url,init={})=>{
  if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'fake-access'});
  if(url.includes('generateIds'))return Response.json({ids:['scan-drive']});
  if(url.includes('/upload/')){scanExists=true;events.push('upload-scan');return Response.json({id:'scan-drive'});}
  const u=new URL(url),id=u.pathname.split('/').at(-1);
  if(u.searchParams.get('alt')==='media'){events.push('readback:'+id);return new Response(mode==='bad-readback'&&id==='scan-drive'?'CORRUPT':bytes);}
  if(init.method==='PATCH'){assert.ok(id.startsWith('weekly-drive'));assert.ok(events.includes('readback:original-drive'));assert.ok(events.includes('readback:scan-drive'));trashed.add(id);events.push('trash-weekly');return Response.json({id});}
  if(id==='scan-drive'&&!scanExists)return new Response('',{status:404});
  return Response.json({id,size:bytes.length,parents:['monthly-folder'],trashed:trashed.has(id),appProperties:{documentId:id.startsWith('weekly-drive')?id.replace('weekly-drive','weekly-fake'):'final-fake',sha256:hash,...(id==='scan-drive'?{variant:'monthly_scan'}:{})}});
 };
 const ctx={createClient:()=>db,Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://fake.supabase.co':'fake'},serve(){}},fetch,crypto:crypto.webcrypto,Blob,Request,Response,URL,URLSearchParams,TextEncoder,Uint8Array,AbortSignal,console,btoa,atob,setTimeout,clearTimeout};vm.createContext(ctx);vm.runInContext(output.outputText,ctx);
 let result=await ctx.runMonthly('final-fake');if(mode==='batch'){assert.ok(result.waiting);assert.equal(stored.manifest.filter(x=>x.done).length,3);assert.equal(events.includes('finish-db'),false);result=await ctx.runMonthly('final-fake');assert.equal(events.filter(x=>x==='upload-scan').length,1);assert.equal(events.filter(x=>x==='remove:private-documents').length,5);}
 if(mode==='ok'||mode==='batch'){assert.equal(result.done,true);assert.ok(events.indexOf('trash-weekly')>events.indexOf('readback:scan-drive'));assert.ok(events.includes('finish-db'));assert.equal(result.removed,mode==='batch'?5:1);}else{assert.equal(events.some(x=>x.startsWith('remove:')||x==='trash-weekly'||x==='finish-db'),false);}
 return {mode,result,events};
}
(async()=>{for(const mode of ['waiting','bad-readback','stale','ok','batch'])await scenario(mode);console.log('PASS backend: original pending, corrupt Drive scan readback and stale final/lease never delete; both-copy verification precedes scoped cleanup and DB completion. Batch restart reuses the scan and skips completed deletions. All services mocked.');})();
