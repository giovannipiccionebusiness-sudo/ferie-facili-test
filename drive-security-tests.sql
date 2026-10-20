
-- Metadata fixtures only. NO HTTP upload/Drive consent claimed by this suite.
begin;
select set_config('test.drive_admin',(select id::text from public.profiles where role='admin' and active),true);
insert into auth.users(id,email,raw_user_meta_data) values
('a1111111-1111-4111-8111-111111111111','drive-test-a@example.invalid','{"full_name":"DRIVE TEST A"}'),
('a2222222-2222-4222-8222-222222222222','drive-test-b@example.invalid','{"full_name":"DRIVE TEST B"}');
update public.profiles set site='N153',active=true where id in ('a1111111-1111-4111-8111-111111111111','a2222222-2222-4222-8222-222222222222');
set local role authenticated;
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
insert into storage.objects(bucket_id,name) values('private-documents','a1111111-1111-4111-8111-111111111111/2026-10/a3333333-3333-4333-8333-333333333333.pdf');
insert into public.documents(id,worker_id,site,month,category,stage,week_ending,file_path,file_name) values
('a3333333-3333-4333-8333-333333333333',auth.uid(),'N153','2026-10','presenze','weekly','2026-10-23','a1111111-1111-4111-8111-111111111111/2026-10/a3333333-3333-4333-8333-333333333333.pdf','SINTETICO-A.pdf');
do $$begin
 if exists(select 1 from public.drive_archive_jobs) then raise exception 'FAIL worker sees archive queue';end if;
 if has_table_privilege('authenticated','public.drive_credentials','SELECT') or has_table_privilege('anon','public.drive_credentials','SELECT') then raise exception 'FAIL OAuth token exposure';end if;
 if has_function_privilege('authenticated','public.drive_claim_job()','EXECUTE') or has_function_privilege('anon','public.drive_consume_state(text)','EXECUTE') then raise exception 'FAIL privileged RPC exposure';end if;
end $$;
select set_config('request.jwt.claim.sub','a2222222-2222-4222-8222-222222222222',true);
do $$begin
 if exists(select 1 from public.documents where id='a3333333-3333-4333-8333-333333333333') then raise exception 'FAIL cross-worker document access';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.drive_admin'),true);
do $$begin
 if not exists(select 1 from public.drive_archive_jobs where document_id='a3333333-3333-4333-8333-333333333333') then raise exception 'FAIL admin queue visibility';end if;
end $$;
reset role;
do $$declare claim jsonb; c2 jsonb; j uuid; begin
 -- Trigger idempotence and metadata state machine.
 insert into public.drive_archive_jobs(document_id) values('a3333333-3333-4333-8333-333333333333') on conflict do nothing;
 if (select count(*) from public.drive_archive_jobs where document_id='a3333333-3333-4333-8333-333333333333')<>1 then raise exception 'FAIL duplicate job';end if;
 claim:=public.drive_claim_job();j:=(claim->'job'->>'document_id')::uuid;
 if j is distinct from 'a3333333-3333-4333-8333-333333333333'::uuid then raise exception 'FAIL job claim';end if;
 c2:=public.drive_claim_job();if c2 is not null then raise exception 'FAIL concurrent worker';end if;
 perform public.drive_finish_job((claim->>'lease')::uuid,j,'SYNTHETIC transient failure');
 if not exists(select 1 from public.drive_archive_jobs where document_id=j and status='retry' and attempts=1 and next_attempt_at>now()) then raise exception 'FAIL retry/backoff';end if;
 update public.drive_archive_jobs set next_attempt_at=now() where document_id=j;
 claim:=public.drive_claim_job();
 perform public.drive_finish_job((claim->>'lease')::uuid,j,null,'SYNTHETIC HASH - no uploaded bytes');
 if not exists(select 1 from public.drive_archive_jobs where document_id=j and status='archived' and attempts=2) then raise exception 'FAIL archived transition';end if;
 if public.drive_claim_job() is not null then raise exception 'FAIL archived reprocessed';end if;
 if exists(select 1 from public.drive_consume_state('synthetic-nonexistent')) then raise exception 'FAIL unknown OAuth state';end if;
 insert into public.drive_oauth_states(state_hash,admin_id,session_id,verifier,expires_at) values('synthetic-expired','a1111111-1111-4111-8111-111111111111',gen_random_uuid(),'synthetic-verifier',now()-interval '1 minute');
 if exists(select 1 from public.drive_consume_state('synthetic-expired')) then raise exception 'FAIL expired OAuth state';end if;
 if public.drive_session_active('a1111111-1111-4111-8111-111111111111',gen_random_uuid()) then raise exception 'FAIL non-admin session accepted';end if;
end $$;
select 'PASS: synthetic queue enqueue/idempotency, worker isolation, backend-only secrets/RPCs, admin visibility, exclusive lease, retry/backoff, archived terminal state, rejected OAuth states/session' as result;
rollback;
