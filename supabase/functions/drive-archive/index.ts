
import { createClient } from "npm:@supabase/supabase-js@2.49.10";
const SUPABASE_ENDPOINT=Deno.env.get("SUPABASE_URL")!;
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT=Deno.env.get("GOOGLE_DRIVE_CLIENT_ID")?.trim();
const SECRET=Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET")?.trim();
const REDIRECT=SUPABASE_ENDPOINT+"/functions/v1/drive-archive/callback";
const APP="https://giovannipiccionebusiness-sudo.github.io";
const SCOPE="https://www.googleapis.com/auth/drive.file";
const db=createClient(SUPABASE_ENDPOINT,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={"Access-Control-Allow-Origin":APP,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...headers,"Content-Type":"application/json","Cache-Control":"no-store"}});
function must<T extends {error:unknown;data:unknown}>(r:T):T["data"]{if(r.error)throw new Error("Database operation failed");return r.data;}
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");
const digest=async(s:string|ArrayBuffer)=>hex(await crypto.subtle.digest("SHA-256",typeof s==="string"?new TextEncoder().encode(s):s));
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,"0")).join("");
const base64url=(b:Uint8Array)=>btoa(String.fromCharCode(...b)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
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
async function folder(access:string,key:string,name:string,parent?:string){
 let row=must(await db.from("drive_folders").select("google_id").eq("path_key",key).maybeSingle()) as any;
 if(!row){
  row={google_id:await allocated(access)};
  must(await db.from("drive_folders").insert({path_key:key,...row}));
 }
 let m=await metadata(access,row.google_id);
 if(!m){
  const r=await request("https://www.googleapis.com/drive/v3/files?fields=id",{method:"POST",headers:{Authorization:"Bearer "+access,"Content-Type":"application/json"},body:JSON.stringify({id:row.google_id,name,mimeType:"application/vnd.google-apps.folder",...(parent?{parents:[parent]}:{}),appProperties:{ferieFaciliPath:key}})});
  if(!r.ok&&r.status!==409)throw new Error("Drive folder HTTP "+r.status);
  m=await metadata(access,row.google_id);
 }
 if(!m||m.mimeType!=="application/vnd.google-apps.folder"||m.appProperties?.ferieFaciliPath!==key||(parent&&!m.parents?.includes(parent)))throw new Error("Drive folder verification failed");
 return row.google_id;
}
const types:Record<string,string>={ferie:"Richieste ferie",rol:"Richieste ROL",legge104:"Legge 104",malattia:"Comunicazioni malattia"};
async function worker(){
 if(!CLIENT||!SECRET)return {processed:0,configured:false,reason:"Credenziali OAuth mancanti"};
 const connection=must(await db.from("drive_credentials").select("*").eq("singleton",true).maybeSingle()) as any;
 if(!connection)return {processed:0,reason:"Google non collegato"};
 const owner=must(await db.from("profiles").select("active,role").eq("id",connection.admin_id).single()) as any;
 if(!owner.active||owner.role!=="admin")throw new Error("Drive administrator disabled");
 if(!CLIENT||!SECRET)return {processed:0,reason:"Credenziali OAuth mancanti"};
 const claim=must(await db.rpc("drive_claim_job")) as any;
 if(!claim)return {processed:0};
 const {job,lease}=claim;
 try{
  const access=(await token({refresh_token:connection.refresh_token,grant_type:"refresh_token"})).access_token;
  const d=must(await db.from("documents").select("*").eq("id",job.document_id).single()) as any;
  // Stable worker UUID is authoritative; changes to the displayed name cannot create new folders.
  const p=must(await db.from("profiles").select("full_name").eq("id",d.worker_id).single()) as any;
  const root=await folder(access,"root","Documenti lavoratori - Ferie Facili TEST");
  if(connection.root_id!==root)must(await db.from("drive_credentials").update({root_id:root}).eq("singleton",true));
  let parent=root;
  const kind=d.category==="presenze"?(d.stage==="final"?"Presenze definitive":"Presenze settimanali"):types[d.category];
  if(!kind)throw new Error("Unsupported document category");
  const names=[d.site==="N153"?"N153 - Corte d’Appello":"N148 - ENAV",(p.full_name||"Lavoratore").replace(/[\\/]/g," ").slice(0,120)+" ["+d.worker_id+"]",d.month.slice(0,4),kind,d.month.slice(5,7)];
  const keys=[d.site,d.worker_id,d.month.slice(0,4),kind,d.month.slice(5,7)];
  let path="root";
  for(let i=0;i<keys.length;i++){path+="/"+keys[i];parent=await folder(access,path,names[i],parent);}
  const stored=await db.storage.from("private-documents").download(d.file_path);
  if(stored.error||!stored.data)throw new Error("Source document unavailable");
  const bytes=await stored.data.arrayBuffer();
  if(bytes.byteLength>12582912)throw new Error("Document too large");
  const hash=await digest(bytes);
  let id=job.google_file_id;
  if(!id){id=await allocated(access);must(await db.from("drive_archive_jobs").update({google_file_id:id}).eq("document_id",d.id));}
  let m=await metadata(access,id);
  if(!m){
   const boundary="ff_"+crypto.randomUUID();
   const meta={id,name:d.id+"_"+d.file_name.replace(/[\\/\r\n]/g,"_"),parents:[parent],appProperties:{documentId:d.id,sha256:hash,stage:d.stage,replaces:d.replaces||""}};
   const body=new Blob(["--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n",JSON.stringify(meta),"\r\n--"+boundary+"\r\nContent-Type: "+(stored.data.type||"application/octet-stream")+"\r\n\r\n",bytes,"\r\n--"+boundary+"--"]);
   const r=await request("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",{method:"POST",headers:{Authorization:"Bearer "+access,"Content-Type":"multipart/related; boundary="+boundary},body});
   if(!r.ok&&r.status!==409)throw new Error("Drive upload HTTP "+r.status);
   m=await metadata(access,id);
  }
  if(!m||m.appProperties?.documentId!==d.id||m.appProperties?.sha256!==hash||Number(m.size)!==bytes.byteLength||!m.parents?.includes(parent))throw new Error("Archive metadata mismatch");
  // Verify access and bytes before marking archived, including after an interrupted upload.
  const read=await request("https://www.googleapis.com/drive/v3/files/"+id+"?alt=media",{headers:{Authorization:"Bearer "+access}});
  if(!read.ok||await digest(await read.arrayBuffer())!==hash)throw new Error("Archive readback failed");
  must(await db.rpc("drive_finish_job",{p_lease:lease,p_document:d.id,p_hash:hash}));
  return {processed:1,archived:true};
 }catch(e){
  const message=e instanceof Error?e.message:"Archive failed";
  must(await db.rpc("drive_finish_job",{p_lease:lease,p_document:job.document_id,p_error:message}));
  return {processed:1,archived:false,error:message};
 }
}
Deno.serve(async(req:Request)=>{
 const path=new URL(req.url).pathname;
 if(req.method==="OPTIONS")return new Response(null,{headers});
 try{
  if(path.endsWith("/callback")){
   if(req.method!=="GET")return json({error:"Method not allowed"},405);
   const url=new URL(req.url),state=url.searchParams.get("state")||"";
   const rows=must(await db.rpc("drive_consume_state",{p_hash:await digest(state)})) as any[];
   if(!rows?.length)throw new Error("OAuth state invalid or expired");
   const code=url.searchParams.get("code");
   if(!code||url.searchParams.has("error"))throw new Error("Google consent not granted");
   const t=await token({code,code_verifier:rows[0].verifier,redirect_uri:REDIRECT,grant_type:"authorization_code"});
   if(!t.refresh_token||!String(t.scope||"").split(" ").includes(SCOPE))throw new Error("Offline Drive permission missing");
   // Recheck role and session at the end of the exchange.
   const check=must(await db.rpc("drive_session_active",{p_admin:rows[0].admin_id,p_session:rows[0].session_id}));
   if(!check)throw new Error("Unauthorized");
   must(await db.from("drive_credentials").upsert({singleton:true,admin_id:rows[0].admin_id,refresh_token:t.refresh_token,connected_at:new Date().toISOString()}));
   return new Response("Google Drive collegato. Torna a Ferie Facili TEST e aggiorna lo stato dell’archivio.",{headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'"}});
  }
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const origin=req.headers.get("Origin");if(origin&&origin!==APP)return json({error:"Origin rejected"},403);
  if(path.endsWith("/worker")){
   const runtime=must(await db.from("drive_runtime").select("worker_key").eq("singleton",true).single()) as any;
   if(req.headers.get("x-drive-worker")!==runtime.worker_key)return json({error:"Unauthorized"},401);
   return json(await worker());
  }
  const user=await admin(req);
  const {action,document_id}=await req.json();
  if(action==="status"){
   const c=must(await db.from("drive_credentials").select("connected_at,root_id").eq("singleton",true).maybeSingle());
   const jobs=must(await db.from("drive_archive_jobs").select("*").order("created_at",{ascending:false}).limit(200));
   return json({configured:!!CLIENT&&!!SECRET,callback:REDIRECT,connection:c,jobs});
  }
  if(action==="connect"){
   if(!CLIENT||!SECRET)return json({error:"Configura GOOGLE_DRIVE_CLIENT_ID e GOOGLE_DRIVE_CLIENT_SECRET nei Secrets della funzione Supabase."},409);
   const state=random(),verifier=random();
   must(await db.from("drive_oauth_states").delete().lt("expires_at",new Date().toISOString()));
   must(await db.from("drive_oauth_states").insert({state_hash:await digest(state),admin_id:user.id,session_id:user.session,verifier}));
   const challenge=base64url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier))));
   const q=new URLSearchParams({client_id:CLIENT,redirect_uri:REDIRECT,response_type:"code",scope:SCOPE,access_type:"offline",prompt:"consent",state,code_challenge:challenge,code_challenge_method:"S256"});
   return json({url:"https://accounts.google.com/o/oauth2/v2/auth?"+q});
  }
  if(action==="retry"){
   if(!document_id)return json({error:"Document id required"},400);
   must(await db.from("drive_archive_jobs").update({status:"pending",attempts:0,last_error:null,next_attempt_at:new Date().toISOString()}).eq("document_id",document_id).in("status",["failed","retry"]));
   return json({ok:true});
  }
  if(action==="process")return json(await worker());
  return json({error:"Unknown action"},400);
 }catch(e){
  const m=e instanceof Error?e.message:"Request failed";
  return json({error:m},m==="Unauthorized"?401:400);
 }
});
