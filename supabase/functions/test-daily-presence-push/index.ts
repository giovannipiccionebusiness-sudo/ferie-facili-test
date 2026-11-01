import webpush from 'npm:web-push@3.6.7';
import {createClient} from 'npm:@supabase/supabase-js@2.49.10';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
function endpointOK(value:string){try{const u=new URL(value);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&u.pathname.length>1&&(u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname.endsWith('.push.apple.com')||u.hostname.endsWith('.notify.windows.com'));}catch{return false;}}
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome'}).format(new Date());
Deno.serve(async req=>{
 if(req.method!=='POST')return reply({error:'Metodo non consentito'},405);
 try{
  const token=req.headers.get('x-push-job');if(!token)return reply({error:'Non autorizzato'},401);
  const {data:cfg,error:ce}=await db.from('test_push_config').select('job_token,public_key,private_jwk').eq('id',true).single();
  if(ce||!cfg||token!==cfg.job_token)return reply({error:'Non autorizzato'},401);
  if(!cfg.public_key||!cfg.private_jwk)return reply({sent:0});
  const {data:items,error}=await db.rpc('claim_test_daily_presence');if(error)throw error;let sent=0;
  for(const item of items||[]){
   const done=async(state:string)=>{const {error:e}=await db.from('test_daily_deliveries').update({state,attempted_at:new Date().toISOString()}).eq('notice_id',item.notice_id).eq('subscription_id',item.subscription_id);if(e)throw e;};
   try{
    const [{data:n,error:ne},{data:s,error:se}]=await Promise.all([db.from('test_daily_notices').select('*').eq('id',item.notice_id).maybeSingle(),db.from('test_push_subscriptions').select('*').eq('id',item.subscription_id).maybeSingle()]);if(ne||se)throw ne||se;
    if(!n||!s||s.user_id!==n.worker_id||s.app_scope!=='test'||!s.push_keys||!endpointOK(s.endpoint)||n.day!==today()||n.read_at){await done('skipped');continue;}
    const [{data:p,error:pe},{data:pref,error:pfe},{data:day,error:de}]=await Promise.all([db.from('profiles').select('active,role').eq('id',n.worker_id).single(),db.from('test_daily_preferences').select('enabled').eq('worker_id',n.worker_id).maybeSingle(),db.from('test_daily_presence').select('day').eq('worker_id',n.worker_id).eq('day',n.day).maybeSingle()]);if(pe||pfe||de)throw pe||pfe||de;
    if(!p.active||p.role!=='worker'||!pref?.enabled||(n.kind==='day'&&day)){await done('skipped');continue;}
    const payload={type:'test-daily-presence',day:n.day,mode:n.kind,noticeId:n.id,title:n.kind==='week'?'Controlla la tua settimana · TEST':'Aggiorna le presenze di oggi · TEST',body:n.kind==='week'?'Ritrovi quanto hai già inserito. Controlla ore in più e assenze e conferma.':'Ore in più o assenze? Segnalale in pochi tocchi.'};
    const details=webpush.generateRequestDetails({endpoint:s.endpoint,keys:s.push_keys},JSON.stringify(payload),{TTL:300,urgency:'normal',contentEncoding:'aes128gcm',vapidDetails:{subject:'https://giovannipiccionebusiness-sudo.github.io/ferie-facili-test/',publicKey:cfg.public_key,privateKey:cfg.private_jwk.d}});
    const response=await fetch(s.endpoint,{method:'POST',headers:details.headers,body:details.body,redirect:'error',signal:AbortSignal.timeout(10000)});
    if(response.ok){await done('sent');sent++;}else await done(response.status===404||response.status===410||item.attempts>=3?'failed':'pending');
   }catch{await done(item.attempts>=3?'failed':'pending');}
  }
  return reply({sent});
 }catch{return reply({error:'Servizio temporaneamente non disponibile'},500);}
});
