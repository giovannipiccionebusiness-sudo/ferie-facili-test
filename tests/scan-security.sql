begin;
do $$ declare a uuid; w uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); begin
 select id into a from public.profiles where role='admin' and active limit 1; if a is null then raise exception 'Admin active required for policy test'; end if;
 insert into auth.users(id,email,raw_user_meta_data) values(w,w::text||'@example.invalid','{"full_name":"Lavoratore scansione fittizio"}');
 insert into public.profiles(id,full_name,role,active,site) values(w,'Lavoratore scansione fittizio','worker',true,'N153') on conflict(id) do update set role=excluded.role,active=true,site=excluded.site;
 insert into storage.objects(bucket_id,name) values('private-documents',w::text||'/2026-10/'||d::text||'.jpeg');
 insert into public.documents(id,worker_id,site,month,category,stage,week_ending,file_path,file_name) values(d,w,'N153','2026-10','presenze','weekly','2026-10-23',w::text||'/2026-10/'||d::text||'.jpeg','originale-fittizio.jpg');
 perform set_config('test.admin_id',a::text,true);perform set_config('test.worker_id',w::text,true);perform set_config('test.document_id',d::text,true);
end $$;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims',json_build_object('sub',current_setting('test.admin_id'),'role','authenticated')::text,true); end $$;
do $$ declare d uuid:=current_setting('test.document_id')::uuid; s text:=current_setting('test.worker_id')||'/2026-10/'||current_setting('test.document_id')||'.jpeg'; begin
 if not private.is_admin() then raise exception 'FAIL admin fixture';end if;
 insert into storage.objects(bucket_id,name) values('document-scans-test',d::text||'/auto-v2.jpg');
 insert into public.test_document_scans(document_id,source_path,file_path,cropped) values(d,s,d::text||'/auto-v2.jpg',true);
 update public.test_document_scans set cropped=false,algorithm_version=2 where document_id=d;
 if not exists(select 1 from public.test_document_scans where document_id=d and not cropped and algorithm_version=2) then raise exception 'FAIL admin read/update';end if;
 if not exists(select 1 from public.documents where id=d and file_path=s) then raise exception 'FAIL original changed';end if;
end $$;
do $$ begin perform set_config('request.jwt.claims',json_build_object('sub',current_setting('test.worker_id'),'role','authenticated')::text,true); end $$;
do $$ declare rejected boolean:=false; begin
 if exists(select 1 from public.test_document_scans where document_id=current_setting('test.document_id')::uuid) then raise exception 'FAIL worker scan visibility';end if;
 if exists(select 1 from storage.objects where bucket_id='document-scans-test') then raise exception 'FAIL worker storage visibility';end if;
 begin insert into public.test_document_scans(document_id,source_path,file_path,cropped) values(current_setting('test.document_id')::uuid,'fake','fake',true);exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'FAIL worker scan write';end if;
 rejected:=false;begin insert into storage.objects(bucket_id,name) values('document-scans-test','forbidden.jpg');exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'FAIL worker storage write';end if;
end $$;
rollback;
select 'PASS admin derivative read/write, worker deny, original unchanged; all fictitious data rolled back' as result;
