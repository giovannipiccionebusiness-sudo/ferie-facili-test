-- TEST only. No existing rows are enqueued or deleted by this installation.
create table public.test_monthly_closures(
 document_id uuid primary key references public.documents(id),
 status text not null default 'pending' check(status in ('pending','processing','retry','done')),
 google_scan_id text, original_drive_id text, original_hash text, scan_hash text,
 pair_verified_at timestamptz, manifest jsonb,
 lease_id uuid, next_attempt_at timestamptz not null default now(),
 last_error text, completed_at timestamptz, created_at timestamptz not null default now()
);
alter table public.test_monthly_closures enable row level security;
revoke all on public.test_monthly_closures from anon,authenticated;
grant select on public.test_monthly_closures to authenticated;
create policy monthly_admin_read on public.test_monthly_closures for select to authenticated using(private.is_admin());
create function private.queue_test_monthly() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.documents d where d.id=new.document_id and d.category='presenze' and d.stage='final') then
  insert into public.test_monthly_closures(document_id) values(new.document_id) on conflict do nothing;
 end if;return new;
end $$;
create trigger queue_test_monthly after insert or update on public.test_document_scans for each row execute function private.queue_test_monthly();

create function public.test_monthly_claim(p_document uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.test_monthly_closures; d public.documents; lease uuid; items jsonb;
begin
 update public.drive_runtime set lease_id=gen_random_uuid(),lease_until=now()+interval '10 minutes' where singleton and (lease_until is null or lease_until<now()) returning lease_id into lease;
 if lease is null then return null;end if;
 select c.* into j from public.test_monthly_closures c join public.documents x on x.id=c.document_id join public.drive_archive_jobs a on a.document_id=x.id
 where c.status<>'done' and c.next_attempt_at<=now() and a.status='archived' and x.category='presenze' and x.stage='final' and x.review_status<>'rejected' and (p_document is null or x.id=p_document)
 and not exists(select 1 from public.documents z where z.worker_id=x.worker_id and z.month=x.month and z.category='presenze' and z.stage='final' and (z.created_at,z.id)>(x.created_at,x.id))
 order by c.created_at for update of c skip locked limit 1;
 if not found then update public.drive_runtime set lease_until=null where singleton and lease_id=lease;return null;end if;
 select * into d from public.documents where id=j.document_id;
 if j.manifest is null then
  select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'path',w.file_path,'google_id',a.google_file_id,'sha256',a.sha256,'done',false)),'[]'::jsonb) into items
  from public.documents w left join public.drive_archive_jobs a on a.document_id=w.id
  where w.worker_id=d.worker_id and w.month=d.month and w.category='presenze' and w.stage in ('weekly','replacement') and w.created_at<=d.created_at;
  j.manifest:=items;
 end if;
 update public.test_monthly_closures set status='processing',lease_id=lease,manifest=j.manifest,next_attempt_at=now()+interval '10 minutes' where document_id=j.document_id returning * into j;
 return jsonb_build_object('lease',lease,'job',to_jsonb(j));
end $$;

create function public.test_monthly_guard(p_document uuid,p_lease uuid) returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from public.test_monthly_closures c join public.documents d on d.id=c.document_id join public.drive_runtime r on r.singleton
 where c.document_id=p_document and c.lease_id=p_lease and r.lease_id=p_lease and r.lease_until>now() and d.category='presenze' and d.stage='final' and d.review_status<>'rejected'
 and not exists(select 1 from public.documents z where z.worker_id=d.worker_id and z.month=d.month and z.category='presenze' and z.stage='final' and (z.created_at,z.id)>(d.created_at,d.id))
 and not exists(select 1 from public.documents w where w.replaces in(select (i->>'id')::uuid from jsonb_array_elements(c.manifest) i) and w.id not in(select (i->>'id')::uuid from jsonb_array_elements(c.manifest) i)))
$$;

create function public.test_monthly_finish(p_document uuid,p_lease uuid) returns integer language plpgsql security definer set search_path='' as $$
declare j public.test_monthly_closures; d public.documents; n integer;
begin
 if not public.test_monthly_guard(p_document,p_lease) then raise exception 'Monthly lease or latest final invalid';end if;
 select * into j from public.test_monthly_closures where document_id=p_document for update;
 select * into d from public.documents where id=p_document;
 if j.pair_verified_at is null or j.original_hash is null or j.scan_hash is null or j.google_scan_id is null or j.original_drive_id is null
 or exists(select 1 from jsonb_array_elements(j.manifest) i where not coalesce((i->>'done')::boolean,false)) then raise exception 'Both Drive copies and cleanup proof required';end if;
 -- Refuse cross-worker/month/final or newly uploaded rows even if a manifest is corrupted.
 if exists(select 1 from jsonb_array_elements(j.manifest) i join public.documents w on w.id=(i->>'id')::uuid where w.worker_id<>d.worker_id or w.month<>d.month or w.category<>'presenze' or w.stage not in ('weekly','replacement') or w.created_at>d.created_at) then raise exception 'Invalid weekly cleanup scope';end if;
 -- A later replacement pointing into this manifest must never be damaged.
 if exists(select 1 from public.documents w where w.replaces in(select (i->>'id')::uuid from jsonb_array_elements(j.manifest) i) and w.id not in(select (i->>'id')::uuid from jsonb_array_elements(j.manifest) i)) then raise exception 'Newer replacement exists';end if;
 delete from public.drive_archive_jobs where document_id in(select (i->>'id')::uuid from jsonb_array_elements(j.manifest) i);
 delete from public.documents where id in(select (i->>'id')::uuid from jsonb_array_elements(j.manifest) i);
 get diagnostics n=row_count;
 update public.test_monthly_closures set status='done',completed_at=now(),last_error=null where document_id=p_document;
 return n;
end $$;
revoke all on function public.test_monthly_claim(uuid),public.test_monthly_guard(uuid,uuid),public.test_monthly_finish(uuid,uuid) from public,anon,authenticated;
grant execute on function public.test_monthly_claim(uuid),public.test_monthly_guard(uuid,uuid),public.test_monthly_finish(uuid,uuid) to service_role;

-- Separate cron: the existing Drive worker and OAuth implementation are unchanged.
create function private.schedule_test_monthly() returns bigint language plpgsql security definer set search_path='' as $$
declare rid bigint;
begin
 if not exists(select 1 from public.drive_credentials c join public.profiles p on p.id=c.admin_id where p.active and p.role='admin')
 or not exists(select 1 from public.test_monthly_closures c join public.drive_archive_jobs a on a.document_id=c.document_id join public.documents d on d.id=c.document_id where c.status<>'done' and c.next_attempt_at<=now() and a.status='archived' and d.review_status<>'rejected' and not exists(select 1 from public.documents z where z.worker_id=d.worker_id and z.month=d.month and z.category='presenze' and z.stage='final' and (z.created_at,z.id)>(d.created_at,d.id))) then return null;end if;
 select net.http_post(url:='https://vffnfulorjftailxyghp.supabase.co/functions/v1/monthly-presence-archive/worker',headers:=jsonb_build_object('Content-Type','application/json','x-drive-worker',(select worker_key from public.drive_runtime where singleton)),body:='{}'::jsonb,timeout_milliseconds:=120000) into rid;
 return rid;
end $$;
revoke all on function private.schedule_test_monthly() from public,anon,authenticated;
select cron.schedule('ferie-facili-test-monthly-close','* * * * *','select private.schedule_test_monthly()');
create function private.test_monthly_replacement_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.replaces is not null and exists(select 1 from public.test_monthly_closures c,jsonb_array_elements(c.manifest) i where c.status<>'done' and (i->>'id')::uuid=new.replaces) then raise exception 'Mensile in chiusura: invia un nuovo foglio definitivo';end if;
 return new;
end $$;
create trigger test_monthly_replacement_guard before insert on public.documents for each row execute function private.test_monthly_replacement_guard();

revoke all on function private.queue_test_monthly(),private.test_monthly_replacement_guard() from public,anon,authenticated;

alter table public.test_document_scans drop constraint test_scan_path;
alter table public.test_document_scans add constraint test_scan_path check(file_path in(document_id::text||'/auto-v1.jpg',document_id::text||'/auto-v2.jpg',document_id::text||'/auto-v2.pdf'));
update storage.buckets set allowed_mime_types=array['image/jpeg','application/pdf'] where id='document-scans-test';
alter policy test_scan_image_insert on storage.objects with check(bucket_id='document-scans-test' and private.is_admin() and exists(select 1 from public.documents d where name in(d.id::text||'/auto-v1.jpg',d.id::text||'/auto-v2.jpg',d.id::text||'/auto-v2.pdf')));
alter policy test_scan_image_update on storage.objects using(bucket_id='document-scans-test' and private.is_admin()) with check(bucket_id='document-scans-test' and private.is_admin() and exists(select 1 from public.documents d where name in(d.id::text||'/auto-v1.jpg',d.id::text||'/auto-v2.jpg',d.id::text||'/auto-v2.pdf')));
