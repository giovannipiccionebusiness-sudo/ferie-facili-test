
import { createClient } from "npm:@supabase/supabase-js@2.49.10";
const SUPABASE_ENDPOINT=Deno.env.get("SUPABASE_URL")!;
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT=Deno.env.get("GOOGLE_DRIVE_CLIENT_ID")?.trim();
const SECRET=Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET")?.trim();
const APP="https://giovannipiccionebusiness-sudo.github.io";
const db=createClient(SUPABASE_ENDPOINT,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={"Access-Control-Allow-Origin":APP,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...headers,"Content-Type":"application/json","Cache-Control":"no-store"}});
function must<T extends {error:unknown;data:unknown}>(r:T):T["data"]{if(r.error)throw new Error("Database operation failed");return r.data;}
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");
const digest=async(s:string|ArrayBuffer)=>hex(await crypto.subtle.digest("SHA-256",typeof s==="string"?new TextEncoder().encode(s):s));
async function request(url:string,init:RequestInit={}){return await fetch(url,{...init,signal:AbortSignal.timeout(20000)});}
function googleTokenError(code:string,status:number){
 const messages:Record<string,string>={
  invalid_client:"Google: invalid_client. ID client e client secret non corrispondono, oppure il segreto non è valido. Verifica i due Secrets Supabase usando lo stesso client Google.",
  invalid_grant:"Google: invalid_grant. Codice scaduto, già utilizzato o verifica PKCE non riuscita. Torna all’app e avvia nuovamente Collega Google Drive.",
  redirect_uri_mismatch:"Google: redirect_uri_mismatch. Registra esattamente la callback indicata nell’app nel client OAuth Google.",
  unauthorized_client:"Google: unauthorized_client. Verifica che il client OAuth sia di tipo Applicazione web e autorizzato per questo flusso.",
  invalid_request:"Google: invalid_request. La richiesta OAuth non è stata accettata; occorre verificare la configurazione."
 };
 return messages[code]||"Google token exchange failed (HTTP "+status+"). Riavvia il collegamento dall’app.";
}
async function token(body:Record<string,string>){
 if(!CLIENT||!SECRET)throw new Error("OAuth credentials missing");
 const r=await request("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({...body,client_id:CLIENT,client_secret:SECRET})});
 if(!r.ok){
  const failure=await r.json().catch(()=>({}));
  // Only fixed messages leave the backend: never return Google's raw response or request.
  throw new Error(googleTokenError(typeof failure.error==="string"?failure.error:"",r.status));
 }
 return await r.json();
}
async function admin(req:Request){
 const jwt=(req.headers.get("Authorization")||"").replace(/^Bearer /,"");
 const result=await db.auth.getUser(jwt);
 if(result.error||!result.data.user)throw new Error("Unauthorized");
 const p=must(await db.from("profiles").select("id,role,active").eq("id",result.data.user.id).single()) as any;
 if(!p.active||p.role!=="admin")throw new Error("Unauthorized");
 // Decode only after getUser has validated the JWT signature.
 const claims=JSON.parse(atob(jwt.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
 if(!claims.session_id||!must(await db.rpc("drive_session_active",{p_admin:p.id,p_session:claims.session_id})))throw new Error("Unauthorized");
 return {id:p.id,session:claims.session_id};
}
async function api(access:string,path:string,init:RequestInit={}){
 const r=await request("https://www.googleapis.com/drive/v3/"+path,{...init,headers:{Authorization:"Bearer "+access,...init.headers}});
 if(!r.ok)throw new Error("Drive HTTP "+r.status);
 return await r.json();
}
async function allocated(access:string){return (await api(access,"files/generateIds?count=1&space=drive&type=files")).ids[0];}
async function metadata(access:string,id:string){
 const r=await request("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(id)+"?fields=id,trashed,size,appProperties,parents,mimeType",{headers:{Authorization:"Bearer "+access}});
 if(r.status===404)return null;
 if(!r.ok)throw new Error("Drive metadata HTTP "+r.status);
 const m=await r.json();if(m.trashed)throw new Error("Drive object is in Trash");return m;
}
async function rawMeta(access:string,id:string){
 const r=await request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?fields=id,trashed,size,appProperties,parents',{headers:{Authorization:'Bearer '+access}});
 if(r.status===404)return null;if(!r.ok)throw Error('Drive metadata HTTP '+r.status);return await r.json();
}
async function verifyBytes(access:string,id:string,hash:string){const r=await request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?alt=media',{headers:{Authorization:'Bearer '+access}});if(!r.ok||await digest(await r.arrayBuffer())!==hash)throw Error('Drive readback failed');}
async function guard(id:string,lease:string){if(!must(await db.rpc('test_monthly_guard',{p_document:id,p_lease:lease})))throw Error('Monthly final changed or lease expired');}
async function processMonthly(id:string|null=null){
 const connection=must(await db.from('drive_credentials').select('*').eq('singleton',true).maybeSingle()) as any;if(!connection)return {waiting:true,reason:'Google Drive non collegato'};
 const owner=must(await db.from('profiles').select('active,role').eq('id',connection.admin_id).single()) as any;if(!owner.active||owner.role!=='admin')throw Error('Drive administrator disabled');
 const claim=must(await db.rpc('test_monthly_claim',{p_document:id})) as any;if(!claim)return {waiting:true,reason:'In attesa dell’originale verificato su Drive o di un altro processo'};
 const {job,lease}=claim;let complete=false;
 try{
  const access=(await token({refresh_token:connection.refresh_token,grant_type:'refresh_token'})).access_token;
  const d=must(await db.from('documents').select('*').eq('id',job.document_id).single()) as any;
  const scan=must(await db.from('test_document_scans').select('*').eq('document_id',d.id).single()) as any;
  if(d.category!=='presenze'||d.stage!=='final'||d.review_status==='rejected'||scan.source_path!==d.file_path)throw Error('Monthly final/scan mismatch');
  const original=must(await db.from('drive_archive_jobs').select('*').eq('document_id',d.id).single()) as any;
  if(original.status!=='archived'||!original.google_file_id||!original.sha256)throw Error('Original not verified on Drive');
  await guard(d.id,lease);
  const om=await metadata(access,original.google_file_id);
  if(!om||om.appProperties?.documentId!==d.id||om.appProperties?.sha256!==original.sha256||!om.parents?.length)throw Error('Original Drive metadata mismatch');
  const source=await db.storage.from('private-documents').download(d.file_path);if(source.error||!source.data||await digest(await source.data.arrayBuffer())!==original.sha256)throw Error('Original source/hash mismatch');
  await verifyBytes(access,original.google_file_id,original.sha256);
  const stored=await db.storage.from('document-scans-test').download(scan.file_path);if(stored.error||!stored.data)throw Error('Scanned source unavailable');
  const bytes=await stored.data.arrayBuffer();if(bytes.byteLength>12582912)throw Error('Scan too large');const hash=await digest(bytes);
  let scanId=job.google_scan_id;
  if(!scanId){scanId=await allocated(access);const allocatedRow=must(await db.from('test_monthly_closures').update({google_scan_id:scanId}).eq('document_id',d.id).eq('lease_id',lease).select('google_scan_id').single()) as any;scanId=allocatedRow.google_scan_id;}
  let sm=await metadata(access,scanId);
  if(!sm){const boundary='ff_'+crypto.randomUUID();const meta={id:scanId,name:d.id+'_PRESENZE_MENSILI_SCANSIONE.'+(stored.data.type==='application/pdf'?'pdf':'jpg'),parents:[om.parents[0]],appProperties:{documentId:d.id,sha256:hash,variant:'monthly_scan'}};
   const body=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',JSON.stringify(meta),'\r\n--'+boundary+'\r\nContent-Type: '+stored.data.type+'\r\n\r\n',bytes,'\r\n--'+boundary+'--']);
   const r=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'multipart/related; boundary='+boundary},body});if(!r.ok&&r.status!==409)throw Error('Drive scan upload HTTP '+r.status);sm=await metadata(access,scanId);
  }
  if(!sm||sm.appProperties?.documentId!==d.id||sm.appProperties?.variant!=='monthly_scan'||sm.appProperties?.sha256!==hash||Number(sm.size)!==bytes.byteLength||!sm.parents?.includes(om.parents[0]))throw Error('Drive scan metadata mismatch');
  await verifyBytes(access,scanId,hash);await guard(d.id,lease);
  must(await db.from('test_monthly_closures').update({original_drive_id:original.google_file_id,original_hash:original.sha256,scan_hash:hash,pair_verified_at:new Date().toISOString(),last_error:null}).eq('document_id',d.id).eq('lease_id',lease));
  const manifest=job.manifest as any[];let processed=0;
  for(const item of manifest){if(item.done)continue;if(processed>=3)break;await guard(d.id,lease);
   if(item.google_id){const m=await rawMeta(access,item.google_id);if(m){if(m.appProperties?.documentId!==item.id||(item.sha256&&m.appProperties?.sha256!==item.sha256))throw Error('Weekly Drive identity mismatch');
     if(!m.trashed){const r=await request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(item.google_id),{method:'PATCH',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify({trashed:true})});if(!r.ok)throw Error('Weekly Drive trash failed');}
     const check=await rawMeta(access,item.google_id);if(check&&!check.trashed)throw Error('Weekly Drive trash verification failed');
   }}
   await guard(d.id,lease);
   const rm=await db.storage.from('private-documents').remove([item.path]);if(rm.error)throw Error('Weekly source deletion failed');
   const derived=await db.storage.from('document-scans-test').remove([item.id+'/auto-v1.jpg',item.id+'/auto-v2.jpg',item.id+'/auto-v2.pdf']);if(derived.error)throw Error('Weekly derivative deletion failed');
   item.done=true;processed++;must(await db.from('test_monthly_closures').update({manifest}).eq('document_id',d.id).eq('lease_id',lease));
  }
  if(manifest.every(x=>x.done)){must(await db.rpc('test_monthly_finish',{p_document:d.id,p_lease:lease}));complete=true;return {done:true,removed:manifest.length};}
  return {waiting:true,reason:'Pulizia settimanali in corso'};
 }catch(e){const message=e instanceof Error?e.message:'Monthly archive failed';must(await db.from('test_monthly_closures').update({last_error:message}).eq('document_id',job.document_id).eq('lease_id',lease));return {done:false,error:message};}
 finally{
  if(!complete)must(await db.from('test_monthly_closures').update({status:'retry',next_attempt_at:new Date(Date.now()+60000).toISOString()}).eq('document_id',job.document_id).eq('lease_id',lease));
  must(await db.from('drive_runtime').update({lease_until:null}).eq('singleton',true).eq('lease_id',lease));
 }
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const origin=req.headers.get('Origin');if(origin&&origin!==APP)return json({error:'Origin rejected'},403);
  if(new URL(req.url).pathname.endsWith('/worker')){const r=must(await db.from('drive_runtime').select('worker_key').eq('singleton',true).single()) as any;if(req.headers.get('x-drive-worker')!==r.worker_key)return json({error:'Unauthorized'},401);return json(await processMonthly());}
  await admin(req);const {action,document_id}=await req.json();
  if(!document_id)return json({error:'Document id required'},400);
  const d=must(await db.from('documents').select('*').eq('id',document_id).single()) as any;
  if(d.category!=='presenze'||d.stage!=='final'||d.review_status==='rejected')return json({error:'Use the complete monthly final'},400);
  const latest=must(await db.from('documents').select('id').eq('worker_id',d.worker_id).eq('month',d.month).eq('category','presenze').eq('stage','final').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1)) as any[];
  if(latest[0]?.id!==d.id)return json({error:'Monthly final superseded'},409);
  if(action==='enqueue'){
   const scan=must(await db.from('test_document_scans').select('document_id,source_path').eq('document_id',d.id).single()) as any;if(scan.source_path!==d.file_path)throw Error('Scan/source mismatch');
   must(await db.from('test_monthly_closures').upsert({document_id:d.id},{onConflict:'document_id',ignoreDuplicates:true}));
  }else if(action!=='status')return json({error:'Unknown action'},400);
  const closure=must(await db.from('test_monthly_closures').select('status,last_error,completed_at,pair_verified_at').eq('document_id',d.id).maybeSingle());return json({closure});
 }catch(e){const m=e instanceof Error?e.message:'Request failed';return json({error:m},m==='Unauthorized'?401:400);}
});
