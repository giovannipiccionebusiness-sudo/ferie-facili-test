import {createClient} from 'npm:@supabase/supabase-js@2.49.10';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const cors={'Access-Control-Allow-Origin':'https://giovannipiccionebusiness-sudo.github.io','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const encode=(v:unknown)=>b64(new TextEncoder().encode(JSON.stringify(v)));
export function validEndpoint(value:string){try{const u=new URL(value);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&u.pathname.length>1&&(u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname.endsWith('.push.apple.com')||u.hostname.endsWith('.notify.windows.com'));}catch{return false;}}
async function config(){const {data,error}=await db.from('test_push_config').select('*').eq('id',true).single();if(error)throw error;return data;}
async function keys(){let row=await config();if(!row.public_key){const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const public_key=b64(new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey)));const private_jwk=await crypto.subtle.exportKey('jwk',pair.privateKey);const {error}=await db.from('test_push_config').update({public_key,private_jwk}).eq('id',true).is('public_key',null);if(error)throw error;row=await config();}return row;}
async function stillNeeded(item:any,sub:any){
 const {data:p,error}=await db.from('profiles').select('active,role').eq('id',sub.user_id).single();if(error||!p)return false;
 if(item.kind==='test')return true;
 if(!p.active||p.role!=='worker')return false;
 if(item.kind==='activation')return true;
 const local=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome'}).format(new Date()),month=local.slice(0,7);
 if(item.kind==='weekly'&&item.event_key!=='weekly:'+local)return false;
 if(item.kind==='monthly'&&item.event_key!=='monthly:'+month)return false;
 const {data:docs,error:e}=await db.from('documents').select('stage,week_ending').eq('worker_id',sub.user_id).eq('month',month).eq('category','presenze').neq('review_status','rejected');if(e)throw e;
 return !(docs||[]).some(d=>d.stage==='final'||(item.kind==='weekly'&&['weekly','replacement'].includes(d.stage)&&d.week_ending===local));
}
async function send(item:any,row:any){
 const {data:sub}=await db.from('test_push_subscriptions').select('*').eq('id',item.subscription_id).maybeSingle();if(!sub)return 'skipped';
 if(!validEndpoint(sub.endpoint)||!await stillNeeded(item,sub)){await db.from('test_push_queue').update({state:'skipped'}).eq('id',item.id);return 'skipped';}
 const audience=new URL(sub.endpoint).origin,key=await crypto.subtle.importKey('jwk',row.private_jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);const token=encode({typ:'JWT',alg:'ES256'})+'.'+encode({aud:audience,exp:Math.floor(Date.now()/1000)+3600,sub:'https://giovannipiccionebusiness-sudo.github.io/ferie-facili-test/'});const signature=b64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(token))));
 // Empty Web Push payload: the service worker supplies a generic private notice.
 const response=await fetch(sub.endpoint,{method:'POST',headers:{Authorization:`vapid t=${token}.${signature}, k=${row.public_key}`,TTL:'300',Urgency:'normal'},redirect:'error',signal:AbortSignal.timeout(10000)});
 if(response.status===404||response.status===410){await db.from('test_push_subscriptions').delete().eq('id',sub.id);return 'expired';}
 const state=response.ok?'sent':item.attempts>=3?'failed':'pending';await db.from('test_push_queue').update({state,attempted_at:new Date().toISOString()}).eq('id',item.id);return response.ok?'sent':'retry';
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('',{headers:cors});if(req.method!=='POST')return reply({error:'Metodo non consentito'},405);
 try{
  const raw=await req.text();if(raw.length>10000)return reply({error:'Richiesta troppo grande'},413);const body=JSON.parse(raw||'{}');
  if(body.action==='dispatch'){
   const row=await config();if(!req.headers.get('x-push-job')||req.headers.get('x-push-job')!==row.job_token)return reply({error:'Non autorizzato'},401);
   if(!row.private_jwk)return reply({sent:0});const {data,error}=await db.rpc('test_claim_push');if(error)throw error;let sent=0;
   for(const item of data||[]){try{if(await send(item,row)==='sent')sent++;}catch{await db.from('test_push_queue').update({state:item.attempts>=3?'failed':'pending',attempted_at:new Date().toISOString()}).eq('id',item.id);}}
   return reply({sent});
  }
  const bearer=req.headers.get('Authorization')?.replace(/^Bearer /i,'');if(!bearer)return reply({error:'Accedi prima di attivare le notifiche.'},401);
  const {data:{user},error}=await db.auth.getUser(bearer);if(error||!user)return reply({error:'Sessione scaduta. Accedi nuovamente.'},401);
  const {data:profile}=await db.from('profiles').select('active,role').eq('id',user.id).single();if(!profile)return reply({error:'Profilo non disponibile'},403);
  if(body.action==='key'){const row=await keys();return reply({publicKey:row.public_key});}
  if(!['subscribe','unsubscribe','test'].includes(body.action)||typeof body.endpoint!=='string'||!validEndpoint(body.endpoint))return reply({error:'Sottoscrizione non valida'},400);
  const {data:existing,error:lookup}=await db.from('test_push_subscriptions').select('*').eq('endpoint',body.endpoint).maybeSingle();if(lookup)throw lookup;
  if(existing&&existing.user_id!==user.id)return reply({error:'Questo telefono è associato a un altro account. Disattiva prima le sue notifiche.'},409);
  if(body.action==='unsubscribe'){if(existing)await db.from('test_push_subscriptions').delete().eq('id',existing.id).eq('user_id',user.id);return reply({ok:true});}
  if(body.action==='subscribe'){
   if(!existing){const {count}=await db.from('test_push_subscriptions').select('id',{count:'exact',head:true}).eq('user_id',user.id);if((count||0)>=5)return reply({error:'Hai già attivato cinque dispositivi.'},400);const {error:e}=await db.from('test_push_subscriptions').insert({user_id:user.id,endpoint:body.endpoint,activation_seen:profile.active});if(e)throw e;}
   return reply({ok:true});
  }
  if(!existing)return reply({error:'Attiva prima le notifiche.'},400);
  if(existing.last_test_at&&Date.now()-Date.parse(existing.last_test_at)<60000)return reply({error:'Attendi un minuto prima di riprovare.'},429);
  const {data:locked,error:lockError}=await db.from('test_push_subscriptions').update({last_test_at:new Date().toISOString()}).eq('id',existing.id).or('last_test_at.is.null,last_test_at.lt.'+new Date(Date.now()-60000).toISOString()).select('id');if(lockError)throw lockError;if(!locked?.length)return reply({error:'Attendi un minuto prima di riprovare.'},429);
  const {data:item,error:e}=await db.from('test_push_queue').insert({subscription_id:existing.id,kind:'test',event_key:'test:'+crypto.randomUUID(),state:'sending',attempts:1,attempted_at:new Date().toISOString()}).select('*').single();if(e)throw e;
  const result=await send(item,await keys());return result==='sent'?reply({ok:true}):reply({error:'Notifica non consegnata. Disattiva e riattiva le notifiche, poi riprova.'},502);
 }catch{return reply({error:'Servizio notifiche momentaneamente non disponibile. Riprova più tardi.'},500);}
});
