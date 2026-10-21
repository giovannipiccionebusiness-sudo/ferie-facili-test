begin;
do $$
declare w uuid:=gen_random_uuid(); other_w uuid:=gen_random_uuid(); a uuid; wk uuid:=gen_random_uuid(); rep uuid:=gen_random_uuid(); f uuid:=gen_random_uuid(); other_m uuid:=gen_random_uuid(); other_d uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); z uuid; lease uuid; claim jsonb; saved jsonb; blocked boolean:=false; r record;
begin
 select id into a from public.profiles where role='admin' and active limit 1;
 insert into auth.users(id,email,raw_user_meta_data) values(w,w::text||'@example.invalid','{"full_name":"TEST monthly fake"}'),(other_w,other_w::text||'@example.invalid','{"full_name":"TEST other fake"}');
 update public.profiles set active=true,site='N153' where id in(w,other_w);
 for r in select * from (values(wk,w,'2026-10','presenze','weekly',null::uuid,'2026-10-23'::date),(rep,w,'2026-10','presenze','replacement',wk,'2026-10-23'::date),(f,w,'2026-10','presenze','final',null::uuid,null::date),(other_m,w,'2026-09','presenze','weekly',null::uuid,'2026-09-25'::date),(other_d,other_w,'2026-10','presenze','weekly',null::uuid,'2026-10-23'::date),(req,w,'2026-10','ferie','request',null::uuid,null::date)) v(id,worker,month,category,stage,replaces,week) loop
  insert into storage.objects(bucket_id,name) values('private-documents',r.worker::text||'/'||r.month||'/'||r.id::text||'.jpeg');
  insert into public.documents(id,worker_id,site,month,category,stage,replaces,week_ending,file_path,file_name) values(r.id,r.worker,'N153',r.month,r.category,r.stage,r.replaces,r.week,r.worker::text||'/'||r.month||'/'||r.id::text||'.jpeg','FITTIZIO.jpeg');
 end loop;
 insert into storage.objects(bucket_id,name) values('document-scans-test',f::text||'/auto-v2.jpg');
 insert into public.test_document_scans(document_id,source_path,file_path,cropped,created_by,algorithm_version) values(f,w::text||'/2026-10/'||f::text||'.jpeg',f::text||'/auto-v2.jpg',true,a,2);
 if not exists(select 1 from public.test_monthly_closures where document_id=f) then raise exception 'FAIL enqueue final';end if;
 if has_function_privilege('authenticated','public.test_monthly_finish(uuid,uuid)','EXECUTE') or has_table_privilege('authenticated','public.test_monthly_closures','UPDATE') then raise exception 'FAIL frontend can delete';end if;
 update public.drive_runtime set lease_until=null where singleton;
 claim:=public.test_monthly_claim(f);
 if claim is not null then raise exception 'FAIL pending original can claim';end if;
 update public.drive_archive_jobs set status='archived',google_file_id='FAKE-original',sha256=repeat('a',64),archived_at=now() where document_id=f;
 claim:=public.test_monthly_claim(f);if claim is null then raise exception 'FAIL ready monthly claim';end if;
 lease:=(claim->>'lease')::uuid;saved:=claim->'job'->'manifest';
 if jsonb_array_length(saved)<>2 then raise exception 'FAIL cleanup scope includes other month/worker/category';end if;
 begin perform public.test_monthly_finish(f,lease);exception when others then blocked:=true;end;
 if not blocked or not exists(select 1 from public.documents where id=wk) then raise exception 'FAIL deletion before pair proof';end if;
 -- A superseding final invalidates the old claim before any deletion.
 loop z:=gen_random_uuid();exit when z>f;end loop;
 insert into storage.objects(bucket_id,name) values('private-documents',w::text||'/2026-10/'||z::text||'.jpeg');
 insert into public.documents(id,worker_id,site,month,category,stage,file_path,file_name) values(z,w,'N153','2026-10','presenze','final',w::text||'/2026-10/'||z::text||'.jpeg','FITTIZIO.jpeg');
 if public.test_monthly_guard(f,lease) then raise exception 'FAIL superseded final accepted';end if;
 delete from public.drive_archive_jobs where document_id=z;delete from public.documents where id=z;
 update public.test_monthly_closures set pair_verified_at=now(),original_hash=repeat('a',64),scan_hash=repeat('b',64),google_scan_id='FAKE-scan',original_drive_id='FAKE-original',manifest=(select jsonb_agg(i||'{"done":true}'::jsonb) from jsonb_array_elements(saved) i) where document_id=f;
 if public.test_monthly_finish(f,lease)<>2 then raise exception 'FAIL expected weekly deletion count';end if;
 if exists(select 1 from public.documents where id in(wk,rep)) or not exists(select 1 from public.documents where id=f) or (select count(*) from public.documents where id in(other_m,other_d,req))<>3 then raise exception 'FAIL preservation scope';end if;
 if (select status from public.test_monthly_closures where document_id=f)<>'done' then raise exception 'FAIL finish state';end if;
end $$;
rollback;
select 'PASS: pending original and missing pair never delete; latest final guard, precise month/worker scope, replacement chains, preserved final/other documents, no frontend deletion privilege. All fixtures rolled back.' as result;
