import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.REST_PGLITE_MODULE||new URL('./rest-db/node_modules/@electric-sql/pglite/dist/index.js',import.meta.url).href),db=new PGlite();
const a='00000000-0000-0000-0000-000000000001',w='00000000-0000-0000-0000-000000000002',other='00000000-0000-0000-0000-000000000003';
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table public.profiles(id uuid primary key,role text,active boolean);create table public.leave_people(person_key text primary key,account_id uuid);insert into public.profiles values('${a}','admin',true),('${w}','worker',true),('${other}','worker',true);insert into public.leave_people values('p','${w}');grant select on public.profiles,public.leave_people to service_role;create table leave_balances(ferie numeric);insert into leave_balances values(12.1234);`);
await db.exec(await readFile(new URL('../supabase/functions/rest-offers-test/schema.sql',import.meta.url),'utf8'));
async function role(name,sql,values=[]){await db.exec('begin;set local role '+name);try{const result=await db.query(sql,values);await db.exec('commit');return result;}catch(e){await db.exec('rollback');throw e;}}
const send="select public.rest_send_offer($1,'p',$2,current_date+30,current_date+32,$3) as offer";
for(const r of ['anon','authenticated']){await assert.rejects(role(r,'select * from public.rest_offers'),/permission denied/);await assert.rejects(role(r,send,[a,w,{title:'fittizio'}]),/permission denied/);}
await assert.rejects(role('service_role',send,[w,w,{}]),/Non autorizzato/);
let r=await role('service_role',send,[a,w,{title:'Un po’ di tempo per te'}]);const offer=r.rows[0].offer;assert.equal(offer.state,'offered');
r=await role('service_role',send,[a,w,{}]);assert.equal(r.rows[0].offer.id,offer.id);assert.equal((await db.query('select count(*)::int as n from rest_offer_audit')).rows[0].n,1);
const respond='select public.rest_reply_offer($1,$2,$3,$4,$5,$6) as offer';await assert.rejects(role('service_role',respond,[other,offer.id,1,'interested',null,null]),/disponibile/);await assert.rejects(role('service_role',respond,[a,offer.id,1,'interested',null,null]),/Non autorizzato/);
r=await role('service_role',respond,[w,offer.id,1,'interested',null,null]);assert.equal(r.rows[0].offer.state,'interested');assert.equal(r.rows[0].offer.version,2);
await assert.rejects(role('service_role',respond,[w,offer.id,1,'declined',null,null]),/Versione/);
await assert.rejects(role('service_role',respond,[w,offer.id,2,'approved',null,null]),/Preferenza/);
await assert.rejects(role('service_role',respond,[w,offer.id,2,'alternative','2030-01-01',null]),/non valide/);
r=await role('service_role',respond,[w,offer.id,2,'alternative','2030-01-01','2030-01-03']);assert.equal(r.rows[0].offer.state,'alternative');
r=await role('service_role',respond,[w,offer.id,3,'declined',null,null]);assert.equal(r.rows[0].offer.alternative_start,null);
assert.equal((await db.query('select ferie::text from leave_balances')).rows[0].ferie,'12.1234');
await db.exec(`update profiles set active=false where id='${w}'`);await assert.rejects(role('service_role',respond,[w,offer.id,4,'interested',null,null]),/Non autorizzato/);
await db.close();console.log('PASS offers PostgreSQL: private tables, active admin/worker checks, recipient isolation, idempotent sends, preference states only, stale version, alternative dates, declined cleanup, original balances unchanged.');
