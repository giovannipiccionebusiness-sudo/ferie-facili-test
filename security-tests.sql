-- Synthetic fixtures only; the entire test is rolled back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-4111-8111-111111111111','admin@example.invalid','{"full_name":"TEST Admin"}'),
 ('22222222-2222-4222-8222-222222222222','worker-a@example.invalid','{"full_name":"TEST Worker A"}'),
 ('33333333-3333-4333-8333-333333333333','worker-b@example.invalid','{"full_name":"TEST Worker B"}'),
 ('44444444-4444-4444-8444-444444444444','inactive@example.invalid','{"full_name":"TEST Inactive"}');
update public.profiles set role='admin',active=true where id='11111111-1111-4111-8111-111111111111';
update public.profiles set site='N153',active=true where id='22222222-2222-4222-8222-222222222222';
update public.profiles set site='N148',active=true where id='33333333-3333-4333-8333-333333333333';
do $$ begin
 begin update public.profiles set role='admin' where id='33333333-3333-4333-8333-333333333333';raise exception 'FAIL multiple administrators';exception when unique_violation then null;end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
 if (select count(*) from public.profiles)<>1 then raise exception 'FAIL worker sees other identities';end if;
 if exists(select 1 from public.audit_log) then raise exception 'FAIL worker audit visibility';end if;
 update public.profiles set role='admin' where id=auth.uid();
 if private.is_admin() then raise exception 'FAIL privilege escalation';end if;
end $$;
insert into storage.objects(bucket_id,name) values('private-documents','22222222-2222-4222-8222-222222222222/2026-10/55555555-5555-4555-8555-555555555555.pdf');
insert into public.documents(id,worker_id,site,month,category,stage,week_ending,file_path,file_name)
 values('55555555-5555-4555-8555-555555555555',auth.uid(),'N153','2026-10','presenze','weekly','2026-10-23','22222222-2222-4222-8222-222222222222/2026-10/55555555-5555-4555-8555-555555555555.pdf','TEST.pdf');
do $$ begin
 if (select count(*) from public.documents)<>1 then raise exception 'FAIL own document not visible';end if;
 update public.documents set review_status='verified' where id='55555555-5555-4555-8555-555555555555';
 if exists(select 1 from public.documents where review_status='verified') then raise exception 'FAIL worker can verify';end if;
 begin delete from storage.objects where name='22222222-2222-4222-8222-222222222222/2026-10/55555555-5555-4555-8555-555555555555.pdf';exception when insufficient_privilege then null;end;
 if not exists(select 1 from storage.objects where name='22222222-2222-4222-8222-222222222222/2026-10/55555555-5555-4555-8555-555555555555.pdf') then raise exception 'FAIL archived object deletion';end if;
end $$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$ begin
 if exists(select 1 from public.documents) or exists(select 1 from storage.objects) then raise exception 'FAIL cross-worker document exposure';end if;
 begin insert into storage.objects(bucket_id,name) values('private-documents','22222222-2222-4222-8222-222222222222/other.pdf');raise exception 'FAIL cross-worker upload';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
do $$ begin
 begin insert into storage.objects(bucket_id,name) values('private-documents','44444444-4444-4444-8444-444444444444/test.pdf');raise exception 'FAIL inactive upload';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
 if (select count(*) from public.profiles)<>4 or (select count(*) from public.documents)<>1 then raise exception 'FAIL admin visibility';end if;
 begin update public.documents set "authorization"='approved' where id='55555555-5555-4555-8555-555555555555';raise exception 'FAIL authorization of attendance';exception when raise_exception then if SQLERRM='FAIL authorization of attendance' then raise;end if;end;
 begin update public.documents set file_name='changed.pdf' where id='55555555-5555-4555-8555-555555555555';raise exception 'FAIL mutable archive';exception when raise_exception then if SQLERRM='FAIL mutable archive' then raise;end if;end;
end $$;
update public.documents set review_status='verified' where id='55555555-5555-4555-8555-555555555555';
do $$ begin
 if not exists(select 1 from public.documents where reviewed_by=auth.uid() and reviewed_at is not null and review_status='verified') then raise exception 'FAIL review provenance';end if;
 if (select count(*) from public.audit_log where target_id='55555555-5555-4555-8555-555555555555')<>2 then raise exception 'FAIL audit trail';end if;
end $$;
insert into public.notifications(worker_id,kind,message,created_by) values('22222222-2222-4222-8222-222222222222','general','TEST reminder',auth.uid());
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$ begin if exists(select 1 from public.notifications) then raise exception 'FAIL notification exposure';end if;end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.mark_notification_read(id) from public.notifications;
do $$ begin if exists(select 1 from public.notifications where read_at is null) then raise exception 'FAIL notification read';end if;end $$;
reset role;
select 'PASS: singleton admin, RLS, worker isolation, inactive users, immutable archive, review provenance, authorization separation, audit, private storage, notifications' as result;
rollback;
