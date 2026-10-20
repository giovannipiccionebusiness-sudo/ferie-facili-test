
-- Dedicated TEST backend only. Apply after schema.sql.
create table public.drive_credentials (
 singleton boolean primary key default true check(singleton),
 admin_id uuid not null references public.profiles(id),
 refresh_token text not null,
 root_id text,
 connected_at timestamptz not null default now()
);
create table public.drive_oauth_states (
 state_hash text primary key,
 admin_id uuid not null references public.profiles(id),
 session_id uuid not null,
 verifier text not null,
 expires_at timestamptz not null default now()+interval '10 minutes'
);
create table public.drive_runtime (
 singleton boolean primary key default true check(singleton),
 worker_key text not null default encode(extensions.gen_random_bytes(32),'hex'),
 lease_id uuid,
 lease_until timestamptz
);
insert into public.drive_runtime(singleton) values(true);
create table public.drive_folders (
 path_key text primary key,
 google_id text not null unique
);
create table public.drive_archive_jobs (
 document_id uuid primary key references public.documents(id),
 status text not null default 'pending' check(status in ('pending','processing','retry','archived','failed')),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 google_file_id text unique,
 sha256 text,
 last_error text,
 archived_at timestamptz,
 created_at timestamptz not null default now()
);
create index drive_jobs_due on public.drive_archive_jobs(next_attempt_at) where status in ('pending','retry','processing');
alter table public.drive_credentials enable row level security;
alter table public.drive_oauth_states enable row level security;
alter table public.drive_runtime enable row level security;
alter table public.drive_folders enable row level security;
alter table public.drive_archive_jobs enable row level security;
revoke all on public.drive_credentials,public.drive_oauth_states,public.drive_runtime,public.drive_folders,public.drive_archive_jobs from public,anon,authenticated;
grant all on public.drive_credentials,public.drive_oauth_states,public.drive_runtime,public.drive_folders,public.drive_archive_jobs to service_role;
grant select on public.drive_archive_jobs to authenticated;
create policy drive_jobs_admin_read on public.drive_archive_jobs for select to authenticated using(private.is_admin());
create function private.enqueue_drive_document() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.drive_archive_jobs(document_id) values(new.id) on conflict do nothing;
 return new;
end $$;
revoke all on function private.enqueue_drive_document() from public,anon,authenticated;
create trigger enqueue_drive_document after insert on public.documents for each row execute function private.enqueue_drive_document();
insert into public.drive_archive_jobs(document_id) select id from public.documents on conflict do nothing;

-- Only backend service_role may consume OAuth state or claim work.
create function public.drive_consume_state(p_hash text) returns setof public.drive_oauth_states
language sql security definer set search_path='' as $$
 delete from public.drive_oauth_states s
 where s.state_hash=p_hash and s.expires_at>now()
 and exists(select 1 from public.profiles p where p.id=s.admin_id and p.active and p.role='admin')
 and exists(select 1 from auth.sessions a where a.id=s.session_id and a.user_id=s.admin_id)
 returning s.*;
$$;
create function public.drive_claim_job() returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.drive_archive_jobs; lease uuid;
begin
 update public.drive_runtime set lease_id=gen_random_uuid(),lease_until=now()+interval '10 minutes'
 where singleton and (lease_until is null or lease_until<now()) returning lease_id into lease;
 if lease is null then return null; end if;
 select * into j from public.drive_archive_jobs
 where status in ('pending','retry','processing') and next_attempt_at<=now()
 order by created_at for update skip locked limit 1;
 if not found then
  update public.drive_runtime set lease_until=null where singleton and lease_id=lease;
  return null;
 end if;
 update public.drive_archive_jobs set status='processing',attempts=attempts+1,next_attempt_at=now()+interval '10 minutes'
 where document_id=j.document_id returning * into j;
 return jsonb_build_object('lease',lease,'job',to_jsonb(j));
end $$;
create function public.drive_finish_job(p_lease uuid,p_document uuid,p_error text default null,p_hash text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.drive_runtime where singleton and lease_id=p_lease and lease_until>now() for update;
 if not found then raise exception 'Expired worker lease'; end if;
 update public.drive_archive_jobs set
 status=case when p_error is null then 'archived' when attempts>=10 then 'failed' else 'retry' end,
 last_error=p_error,sha256=coalesce(p_hash,sha256),
 archived_at=case when p_error is null then now() else null end,
 next_attempt_at=now()+make_interval(secs=>least(3600,(30*power(2,least(attempts,7)))::int))
 where document_id=p_document and status='processing';
 update public.drive_runtime set lease_until=null where singleton and lease_id=p_lease;
end $$;
revoke all on function public.drive_consume_state(text),public.drive_claim_job(),public.drive_finish_job(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.drive_consume_state(text),public.drive_claim_job(),public.drive_finish_job(uuid,uuid,text,text) to service_role;

create function public.drive_session_active(p_admin uuid,p_session uuid) returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.sessions s on s.user_id=p.id where p.id=p_admin and p.active and p.role='admin' and s.id=p_session);
$$;
revoke all on function public.drive_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.drive_session_active(uuid,uuid) to service_role;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
-- Deny-by-default tables are intentionally accessible only to service_role.
comment on table public.drive_credentials is 'Backend only. No browser role has privileges; RLS deny by default.';
comment on table public.drive_oauth_states is 'Backend only, single-use expiring OAuth/PKCE state.';
create function private.schedule_drive_archive() returns bigint language plpgsql security definer set search_path='' as $$
declare request_id bigint;
begin
 if not exists(select 1 from public.drive_credentials c join public.profiles p on p.id=c.admin_id where p.active and p.role='admin')
 or not exists(select 1 from public.drive_archive_jobs where status in ('pending','retry','processing') and next_attempt_at<=now())
 then return null; end if;
 select net.http_post(
  url:='https://vffnfulorjftailxyghp.supabase.co/functions/v1/drive-archive/worker',
  headers:=jsonb_build_object('Content-Type','application/json','x-drive-worker',(select worker_key from public.drive_runtime where singleton)),
  body:='{}'::jsonb,timeout_milliseconds:=120000
 ) into request_id;
 return request_id;
end $$;
revoke all on function private.schedule_drive_archive() from public,anon,authenticated;
select cron.schedule('ferie-facili-drive-archive','* * * * *','select private.schedule_drive_archive();');
